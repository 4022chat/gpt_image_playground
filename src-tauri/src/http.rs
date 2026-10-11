//! 客户端发出的 API 和远程图片请求，前端 apiFetch 据此构造标准 Response。
//! 不用 tauri-plugin-http：它取消读取响应体时，正在等待的读取仍持有连接，直到服务端发来下一块数据或关闭才断开，
//! 上游可能继续生成并计费。这里读取和取消同时等待，取消时立即丢弃响应、断开连接。
//! 请求体经 IPC 二进制传入，不再转成 JSON 数字数组；网络错误在这里转换成中文原因。
use std::collections::HashMap;
use std::io::ErrorKind;
use std::sync::Mutex;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_LENGTH};
use reqwest::{Method, Url};
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;
use tokio::sync::watch;

use crate::files::header;

const CANCELED: &str = "请求已取消";
const USER_AGENT: &str = concat!("gpt-image-playground/", env!("CARGO_PKG_VERSION"));

struct Pending {
    cancel: watch::Sender<bool>,
    /// 收到响应头后存放响应，读取期间暂时取出
    res: Option<reqwest::Response>,
}

impl Pending {
    fn new(canceled: bool) -> Self {
        Self {
            cancel: watch::channel(canceled).0,
            res: None,
        }
    }
}

/// 进行中的请求，以前端生成的 id 区分
#[derive(Default)]
pub struct Requests(Mutex<HashMap<String, Pending>>);

impl Requests {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Pending>> {
        self.0.lock().unwrap_or_else(|err| err.into_inner())
    }

    /// 页面重载时调用：丢弃全部记录和响应，进行中的请求随即断开，等待中的命令以“已取消”返回
    pub fn clear(&self) {
        self.lock().clear();
    }
}

#[derive(Deserialize)]
struct Meta {
    id: String,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Head {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    url: String,
}

/// reqwest 的 Display 不含底层原因，拼上整条 source 链，并取出其中的 IO 错误类型
fn describe(err: &reqwest::Error) -> (String, Option<ErrorKind>) {
    let mut detail = err.to_string();
    let mut kind = None;
    let mut source = std::error::Error::source(err);
    while let Some(e) = source {
        detail.push_str(": ");
        detail.push_str(&e.to_string());
        if let Some(io) = e.downcast_ref::<std::io::Error>() {
            kind = kind.or(Some(io.kind()));
        }
        source = e.source();
    }
    (detail, kind)
}

fn send_error(err: &reqwest::Error) -> String {
    let (detail, kind) = describe(err);
    let lower = detail.to_lowercase();
    let reason = if err.is_timeout() || kind == Some(ErrorKind::TimedOut) {
        "连接超时，服务器长时间没有响应"
    } else if lower.contains("dns error") {
        "无法解析域名，请检查 API 地址是否正确"
    } else if kind == Some(ErrorKind::ConnectionRefused) {
        "连接被拒绝，请检查 API 地址和端口是否正确、服务是否已启动"
    } else if matches!(kind, Some(ErrorKind::ConnectionReset | ErrorKind::ConnectionAborted)) {
        "连接被服务器重置"
    } else if lower.contains("connection closed before message completed") {
        "服务器未返回响应就关闭了连接"
    } else if ["certificate", "tls", "handshake", "corrupt message"].iter().any(|s| lower.contains(s)) {
        "TLS 握手失败，请检查服务器证书"
    } else if err.is_redirect() {
        "重定向次数过多"
    } else {
        "无法连接到服务器"
    };
    format!("{reason}（{detail}）")
}

/// 开始等待取消信号；取消先于请求到达时直接返回已取消
fn subscribe(state: &Requests, id: &str) -> Result<watch::Receiver<bool>, String> {
    let mut map = state.lock();
    let pending = map
        .entry(id.to_string())
        .or_insert_with(|| Pending::new(false));
    if *pending.cancel.borrow() {
        map.remove(id);
        return Err(CANCELED.into());
    }
    Ok(pending.cancel.subscribe())
}

/// 校验请求参数并构造请求
fn build(meta: &Meta, body: Vec<u8>) -> Result<reqwest::RequestBuilder, String> {
    let url = Url::parse(&meta.url).map_err(|err| format!("请求地址不合法：{err}"))?;
    // 只允许 http/https，主机和端口不限
    if !matches!(url.scheme(), "http" | "https") {
        return Err(format!("不支持的请求地址：{url}"));
    }
    let method = Method::from_bytes(meta.method.as_bytes())
        .map_err(|_| format!("请求方法不合法：{}", meta.method))?;
    let mut headers = HeaderMap::new();
    for (name, value) in &meta.headers {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("请求头名称不合法：{name}"))?;
        // 前端的请求头值是 ByteString（每个字符不超过 0xFF），与响应头对称按 Latin-1 还原成字节
        let value = value
            .chars()
            .map(u8::try_from)
            .collect::<Result<Vec<u8>, _>>()
            .ok()
            .and_then(|bytes| HeaderValue::from_bytes(&bytes).ok())
            .ok_or_else(|| format!("请求头 {name} 的值不合法"))?;
        headers.append(name, value);
    }
    // 与浏览器一致，没有请求体的 POST、PUT 也带上 Content-Length: 0；reqwest 对空请求体不会自动添加
    if body.is_empty() && matches!(method, Method::POST | Method::PUT) {
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("0"));
    }
    // 与原先的插件一样每次新建客户端：系统代理设置变化后的请求立即生效，取消时连接不会留在连接池中
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|err| format!("创建 HTTP 客户端失败：{err}"))?;
    let req = client.request(method, url).headers(headers);
    Ok(if body.is_empty() { req } else { req.body(body) })
}

/// 发出请求并等待响应头。请求参数经 x-meta 头传入（encodeURIComponent 编码的 JSON），请求体为二进制
#[tauri::command]
pub async fn http_send(request: Request<'_>, state: State<'_, Requests>) -> Result<Head, String> {
    let meta = percent_encoding::percent_decode_str(header(&request, "x-meta"))
        .decode_utf8()
        .map_err(|_| "请求参数不是合法的 UTF-8".to_string())?;
    let meta: Meta = serde_json::from_str(&meta).map_err(|err| format!("请求参数不合法：{err}"))?;
    // 先登记再校验：取消可能已先到达并留下记录，校验失败时也要一并清除
    let mut cancel = subscribe(&state, &meta.id)?;
    let body = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        _ => Vec::new(),
    };
    let req = match build(&meta, body) {
        Ok(req) => req,
        Err(err) => {
            state.lock().remove(&meta.id);
            return Err(err);
        }
    };
    let result = tokio::select! {
        res = req.send() => res,
        _ = cancel.wait_for(|canceled| *canceled) => return Err(CANCELED.into()),
    };

    let mut map = state.lock();
    let res = match result {
        Ok(res) => res,
        Err(err) => {
            map.remove(&meta.id);
            return Err(send_error(&err));
        }
    };
    let status = res.status().as_u16();
    // 前端 Response 只接受 200～599，其他状态码（如未处理的 101）在这里报错，不留下记录
    if !(200..=599).contains(&status) {
        map.remove(&meta.id);
        return Err(format!("服务器返回了不支持的状态码 {status}"));
    }
    let head = Head {
        status,
        status_text: res.status().canonical_reason().unwrap_or_default().into(),
        // 与浏览器一致按 Latin-1 解读响应头，避免非 UTF-8 的值在前端构造 Headers 时报错
        headers: res
            .headers()
            .iter()
            .map(|(name, value)| (name.to_string(), value.as_bytes().iter().map(|&b| b as char).collect()))
            .collect(),
        url: res.url().to_string(),
    };
    let Some(pending) = map.get_mut(&meta.id) else {
        return Err(CANCELED.into());
    };
    pending.res = Some(res);
    Ok(head)
}

/// 读取下一块响应体，读完时返回空内容；取消时立即丢弃响应、断开连接
#[tauri::command]
pub async fn http_read(id: String, state: State<'_, Requests>) -> Result<Response, String> {
    let (mut res, mut cancel) = {
        let mut map = state.lock();
        let pending = map.get_mut(&id).ok_or(CANCELED)?;
        let res = pending.res.take().ok_or("响应体正在读取中")?;
        (res, pending.cancel.subscribe())
    };
    loop {
        let chunk = tokio::select! {
            chunk = res.chunk() => chunk,
            _ = cancel.wait_for(|canceled| *canceled) => return Err(CANCELED.into()),
        };
        let mut map = state.lock();
        match chunk {
            Ok(Some(bytes)) if bytes.is_empty() => continue,
            Ok(Some(bytes)) => {
                let pending = map.get_mut(&id).ok_or(CANCELED)?;
                pending.res = Some(res);
                return Ok(Response::new(bytes.to_vec()));
            }
            Ok(None) => {
                map.remove(&id);
                return Ok(Response::new(Vec::new()));
            }
            Err(err) => {
                map.remove(&id);
                return Err(format!("读取响应时连接中断（{}）", describe(&err).0));
            }
        }
    }
}

/// 取消请求。取消可能先于 http_send 到达，此时留下已取消的记录，http_send 开始时看到后直接返回
#[tauri::command]
pub fn http_cancel(id: String, state: State<'_, Requests>) {
    let mut map = state.lock();
    match map.remove(&id) {
        // 丢弃记录时一并丢弃已收到的响应，连接随即断开
        Some(pending) => {
            pending.cancel.send_replace(true);
        }
        None => {
            map.insert(id, Pending::new(true));
        }
    }
}

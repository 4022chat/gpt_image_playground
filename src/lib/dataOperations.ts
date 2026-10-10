import type { AgentConversation, TaskRecord } from '../types'

let dataTransfers = 0

export function hasActiveDataOperations(tasks: TaskRecord[], agentConversations: AgentConversation[]) {
  return tasks.some((task) => task.status === 'running' || task.falRecoverable || task.customRecoverable)
    || agentConversations.some((conversation) => conversation.rounds.some((round) => round.status === 'running'))
}

/** 启动时会继续查询结果的 fal 队列任务 */
export function isFalRecoverableTask(task: TaskRecord) {
  return task.apiProvider === 'fal' && Boolean(task.falRequestId && task.falEndpoint) && (task.status === 'running' || Boolean(task.falRecoverable))
}

/** 启动时会继续查询结果的自定义异步任务 */
export function isCustomRecoverableTask(task: TaskRecord) {
  return Boolean(task.customTaskId) && (task.status === 'running' || Boolean(task.customRecoverable))
}

/** 关闭客户端会中断、且重启后无法恢复的操作：无法恢复的运行中任务、运行中的 Agent 轮次和数据操作 */
export function hasInterruptibleOperations(tasks: TaskRecord[], agentConversations: AgentConversation[]) {
  return dataTransfers > 0
    || tasks.some((task) => task.status === 'running' && !isFalRecoverableTask(task) && !isCustomRecoverableTask(task))
    || agentConversations.some((conversation) => conversation.rounds.some((round) => round.status === 'running'))
}

/** 记录进行中的数据导入导出、清空、ZIP 打包和图片保存，客户端关闭窗口时据此提示 */
export async function trackDataTransfer<T>(run: () => Promise<T>) {
  dataTransfers++
  try {
    return await run()
  } finally {
    dataTransfers--
  }
}

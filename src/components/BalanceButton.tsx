const LOG_URL = 'https://api.openlux.ai/console/log'

export default function BalanceButton() {
  return (
    <a
      href={LOG_URL}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
    >
      使用日志
    </a>
  )
}

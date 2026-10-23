import { useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { getActiveApiProfile, getAgentImageApiProfile, resolveApiProfileModel } from '../lib/apiProfiles'
import Select from './Select'

interface ApiProfileSelectProps {
  triggerClassName?: string
}

// 头部与移动端参数区共用的 API 配置选择器
export default function ApiProfileSelect({ triggerClassName }: ApiProfileSelectProps) {
  const appMode = useStore((s) => s.appMode)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const reusedTaskApiProfileId = useStore((s) => s.reusedTaskApiProfileId)
  const reusedTaskApiModel = useStore((s) => s.reusedTaskApiModel)

  const settingsActiveProfile = useMemo(() => getActiveApiProfile(settings), [settings])
  const currentActiveProfile = useMemo(() => (
    appMode === 'agent'
      ? getAgentImageApiProfile(settings) ?? settingsActiveProfile
      : settingsActiveProfile
  ), [appMode, settings, settingsActiveProfile])
  const activeProfile = useMemo(() => {
    const reusedProfile = appMode !== 'agent' && settings.reuseTaskApiProfileTemporarily && reusedTaskApiProfileId
      ? settings.profiles.find((profile) => profile.id === reusedTaskApiProfileId)
      : undefined
    return reusedProfile ? resolveApiProfileModel(reusedProfile, reusedTaskApiModel ?? undefined) : currentActiveProfile
  }, [appMode, currentActiveProfile, reusedTaskApiModel, reusedTaskApiProfileId, settings])

  const selectableProfiles = settings.profiles.filter((profile) => profile.apiMode === (appMode === 'agent' ? 'responses' : 'images'))
  const profileOptions = selectableProfiles.map((profile) => ({
    label: `${profile.name}`,
    value: profile.id,
  }))
  const selectedProfile = selectableProfiles.some((profile) => profile.id === activeProfile.id)
    ? activeProfile
    : selectableProfiles[0] ?? activeProfile

  useEffect(() => {
    // 提示词库模式下不参与选择，避免误改当前配置
    if (appMode === 'prompt-library') return
    if (selectedProfile.id !== activeProfile.id) setSettings({ activeProfileId: selectedProfile.id })
  }, [appMode, activeProfile.id, selectedProfile.id, setSettings])

  const switchProfile = (value: string | number) => {
    setSettings({ activeProfileId: String(value) })
    useStore.getState().setReusedTaskApiProfile(null)
  }

  if (appMode === 'prompt-library') return null

  return (
    <Select
      value={selectedProfile.id}
      onChange={switchProfile}
      options={profileOptions}
      showValueTooltips
      className={triggerClassName}
    />
  )
}

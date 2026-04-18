import { isEnvTruthy } from '../utils/envUtils.js'

// Lazy read so ENABLE_GROWTHBOOK_DEV from globalSettings.env (applied after
// module load) is picked up. USER_TYPE is a build-time define so it's safe.
export function getGrowthBookClientKey(): string {
  // 适配器优先：自定义 GrowthBook 服务器
  const adapterKey = process.env.CLAUDE_GB_ADAPTER_KEY
  if (adapterKey) return adapterKey

  // [SECURITY PATCH] Removed hardcoded SDK keys
  return ''
}

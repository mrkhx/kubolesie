import { loadVkConfig, logVkStartup } from './config';

export async function main(): Promise<void> {
  const config = loadVkConfig();
  logVkStartup(config);
  if (!config.groupToken) {
    console.log('[vk-bot] VK_GROUP_TOKEN is empty. Bot stays in mock mode. Game core does not require VK.');
    return;
  }
  console.log('[vk-bot] Token present. Callback endpoint lives on the API process: POST /vk/callback.');
}

if (require.main === module) {
  void main();
}

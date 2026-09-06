/**
 * VK bot process skeleton.
 * Prototype 0.0.1 does not connect to the live VK API.
 * Incoming community messages will later land here, be normalized,
 * and forwarded to GameRuntime through VkAdapter.
 */
export async function main(): Promise<void> {
  const token = process.env.VK_GROUP_TOKEN;
  if (!token) {
    console.log(
      '[vk-bot] VK_GROUP_TOKEN is empty. Bot stays in mock mode. Game core does not require VK.',
    );
    return;
  }
  console.log('[vk-bot] Token present, but production webhook is not enabled in 0.0.1.');
}

if (require.main === module) {
  void main();
}

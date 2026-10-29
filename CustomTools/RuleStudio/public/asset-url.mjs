// The HTML shell supplies a versioned local release or the same release on COS.
export function assetUrl(url) {
  const base = globalThis.ruleStudioAssetBase || '';
  return base && url.startsWith('/') && !url.startsWith('//') ? base + url : url;
}

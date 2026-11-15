const MARKDOWN_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function formatInboxMessage(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/(```[\s\S]*?```|`[^`\n]+`)/)
    .map((part, index) => index % 2 === 1 ? part : part
      .replace(MARKDOWN_LINK, (_, label: string, url: string) => label === url ? url : `${label} (${url})`)
      .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_, stars: string, underscores: string) => `*${stars ?? underscores}*`)
      .replace(/~~([^~\n]+)~~/g, "~$1"))
    .join("")
    .trim();
}

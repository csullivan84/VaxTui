export interface SystemPromptSkill {
  name: string;
  description: string;
  activate: string;
  source_path?: string;
  origin?: string;
  license?: string;
  compatibility?: string;
  when?: string;
  allowed_tools?: string;
  metadata?: Record<string, string>;
}

function decodeCodePoint(entity: string, value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  return Number.isFinite(codePoint) && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : entity;
}

function decodeXML(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (entity, codePoint) => decodeCodePoint(entity, codePoint, 16))
    .replace(/&#(\d+);/g, (entity, codePoint) => decodeCodePoint(entity, codePoint, 10))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return decodeXML(match?.[1]?.trim() ?? "");
}

export function extractSystemPromptSkills(
  prompt: string,
  metadata: SystemPromptSkill[] = [],
): SystemPromptSkill[] {
  // New messages persist the exact discovered skill records. Prefer that
  // authoritative representation; parsing the rendered prompt remains only
  // for messages created before skill metadata was added.
  if (metadata.length > 0) return metadata;
  const section = prompt.match(/<available_skills>([\s\S]*?)<\/available_skills>/)?.[1];
  if (!section) return [];

  return Array.from(section.matchAll(/<skill>([\s\S]*?)<\/skill>/g), (match) => {
    const parsed = {
      name: tagValue(match[1], "name"),
      description: tagValue(match[1], "description"),
      activate: tagValue(match[1], "activate"),
    };
    return parsed;
  }).filter((skill) => skill.name);
}

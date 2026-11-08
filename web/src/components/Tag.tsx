/** Oturum etiketi (ör. "CLOUD AI"): ilk salon kırmızı, ikinci salon yeşil tonlu. */
export function Tag({ tag, hallIndex }: { tag?: string; hallIndex: number }) {
  if (!tag) return null;
  return <span className={`tag ${hallIndex === 1 ? 'tag-2' : 'tag-1'}`}>{tag}</span>;
}

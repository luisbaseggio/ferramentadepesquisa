export const CONTENT_FORMATS = [
  { id: "carrossel-instagram", label: "Carrossel" },
  { id: "post-unico", label: "Post único" },
  { id: "thread-x", label: "Thread" },
  { id: "reels-curto", label: "Reels" }
];

export function getContentFormat(format) {
  return CONTENT_FORMATS.find((item) => item.id === format) || CONTENT_FORMATS[0];
}

export function contentFormatLabel(format) {
  return getContentFormat(format).label;
}

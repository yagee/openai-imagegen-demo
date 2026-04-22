import type { PhotoboothStyleId } from "@/lib/photobooth-styles";

export const APP_NAME = "Image Generation Chat Demo";

export const PHOTOBOOTH_SESSION_STORAGE_KEY = "photobooth.request";

export const MAX_SELECTED_STYLES = 4;

export const STYLE_LIMIT_TOOLTIP = "You can select up to 4 styles at a time";

export const DEFAULT_SELECTED_STYLE_IDS: PhotoboothStyleId[] = [
  "knitted",
  "digital-art",
];

export const IMAGEGEN_API_ROUTE = "/api/photobooth";

export const OPENAI_IMAGE_MODEL = "gpt-image-2";
export const OPENAI_IMAGE_SIZE = "1024x1536";
export const OPENAI_IMAGE_QUALITY = "low";
export const OPENAI_IMAGE_OUTPUT_FORMAT = "png";
export const OPENAI_IMAGE_PARTIAL_IMAGES = 0;

export const OPENAI_IMAGE_OUTPUT_REQUIREMENTS =
  "Output requirements: portrait orientation (2:3 aspect ratio), preserve the exact people, poses, facial expressions, and scene composition as faithfully as possible.";

export type RatingContext = 'gay' | 'cute' | 'rizz' | 'intelligent' | 'autistic' | 'simp';

// Add one local resource path per context. The renderer falls back to a neutral
// background when an image cannot be loaded.
export const ratingBackgrounds: Record<RatingContext, string> = {
  gay: 'ratingBackgrounds/howgay.jpg',
  cute: 'ratingBackgrounds/howcute.jpg',
  rizz: 'ratingBackgrounds/howrizz.jpg',
  intelligent: 'ratingBackgrounds/howintelligent.jpg',
  autistic: 'ratingBackgrounds/howautistic.jpg',
  simp: 'ratingBackgrounds/howsimp.jpg',
};
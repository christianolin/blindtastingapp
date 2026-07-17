// Favorite-wine-type options on a profile — flavor text, not a reference
// table (nothing scoring-related keys off this), so a plain fixed list stored
// as text on profiles.favorite_wine_type is simplest.
export const FAVORITE_WINE_TYPE_ITEMS: Record<string, string> = {
  RED: "Red",
  WHITE: "White",
  ROSE: "Rosé",
  SPARKLING: "Sparkling",
  ORANGE: "Orange",
  FORTIFIED: "Fortified",
  DESSERT: "Dessert / sweet",
};

/**
 * Converts a string to title case (first letter of each word capitalized).
 * @param {string} str
 * @returns {string}
 */
export function titleCase(str) {
  if (typeof str !== "string") {
    return str;
  }
  return str
    .split(" ")
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

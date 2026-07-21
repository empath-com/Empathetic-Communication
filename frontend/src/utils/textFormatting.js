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

/**
 * Generates a random 16-character access code formatted as XXXX-XXXX-XXXX-XXXX.
 * @returns {string}
 */
export function generateAccessCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code.match(/.{1,4}/g).join("-");
}

// Function to format student full names (lowercase and spaces replaced with "_")
const formatNames = (name) => {
  return name.toLowerCase().replace(/\s+/g, "_");
};

function generateAccessCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code.match(/.{1,4}/g).join("-");
}

module.exports = { formatNames, generateAccessCode };

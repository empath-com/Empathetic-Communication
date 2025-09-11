const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const AWS = require('aws-sdk');

const client = jwksClient({
  jwksUri: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: process.env.COGNITO_CLIENT_ID,
      issuer: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });
}

async function getStsCredentials(idToken) {
  const cognitoIdentity = new AWS.CognitoIdentity({ region: process.env.AWS_REGION });
  const identityId = await cognitoIdentity.getId({
    IdentityPoolId: process.env.IDENTITY_POOL_ID,
    Logins: {
      [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`]: idToken
    }
  }).promise();

  const credentials = await cognitoIdentity.getCredentialsForIdentity({
    IdentityId: identityId.IdentityId,
    Logins: {
      [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`]: idToken
    }
  }).promise();

  return credentials.Credentials;
}

module.exports = { verifyToken, getStsCredentials };
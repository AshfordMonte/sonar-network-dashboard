// sonarClient.js (CommonJS)

async function sonarGraphqlRequest({ endpoint, token, query, variables = {} }) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sonar GraphQL HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors?.length) {
    throw new Error(`Sonar GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

module.exports = { sonarGraphqlRequest };

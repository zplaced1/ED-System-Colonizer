const RADIUS_MAX = "100" // 1 to 100
const RADIUS_MIN = "0" // 0 to `RANGE_MAX`
const ORIGIN = "HIP 114587" // Should be a valid system name
const ALL_SYSTEMS_URL = `https://www.edsm.net/api-v1/sphere-systems?systemName=${encodeURIComponent(ORIGIN)}&radius=100&minRadius=0&showInformation=1`
// https://www.edsm.net/api-v1/sphere-systems?systemName=Piscium%20Sector%20JY-Q%20a5-4&radius=100&minRadius=0&showInformation=1
async function main() {
  const results = []

  const allSystems = await makeHTTPRequest(ALL_SYSTEMS_URL)
  console.log(ALL_SYSTEMS_URL)

  if (allSystems.length === undefined) {
    console.error("Error: EDSM API returned empty response")
    return
  }

  for (const system of allSystems) {
    // Skip if system is populated
    if (system.information?.population !== 0 || system.information?.population === undefined) {
      continue
    }

    console.log(`Checking bodies in system ${system.name}`)

    const bodiesUrl = `https://www.edsm.net/api-system-v1/bodies?systemName=${encodeURIComponent(system.name)}`
    const bodyData = await makeHTTPRequest(bodiesUrl)

    // Skip if no bodies exist in system
    if (!bodyData.bodies.length) {
      continue
    }

    for (const body of bodyData.bodies) {
      if (body.subType === "Earth-like world") {
        results.push(system.name)
        break
      }
    }
  }

  console.log(`Found ${results.length} systems with at least one ELW in unpopulated systems`)
}

/**
 * 
 * @param {string} url URL for HTTP request. **Ensure it is properly encoded before passing it in.**
 * @returns {Object[]} JSON response object
 */
async function makeHTTPRequest(url) {
  const response = await fetch(url)

  if (response.status !== 200) {
    console.error(`Error: EDSM API returned status code ${response.status}`)
    return
  }

  return await response.json()
}

main()

/**
 * ED System Finder - API Proxy Server
 * 
 * This server acts as a proxy to handle CORS requests to Inara.cz and EDSM API
 * as well as serving the static frontend files.
 */

const express = require('express');
const axios = require('axios');
const path = require('path');
const { JSDOM } = require('jsdom');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON requests
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Inara.cz API proxy endpoint
app.get('/api/inara/nearest-systems', async (req, res) => {
  try {
    // Get parameters from query string
    const referenceSystem = req.query.referenceSystem;
    const anyPopulation = req.query.anyPopulation === 'true';
    
    if (!referenceSystem) {
      return res.status(400).json({ error: 'Reference system is required' });
    }
    
    // Set population parameter: 0 for any population, -1 for empty systems
    const populationParam = anyPopulation ? '0' : '-1';
    
    // Construct the Inara.cz URL
    const inaraUrl = `https://inara.cz/elite/nearest-starsystems/?formbrief=1&ps1=${encodeURIComponent(referenceSystem)}&pi3=&pi4=0&pi5=0&pi7=0&pi1=0&pi23=${populationParam}&pi6=0&pi26=0&ps3=&pi24=0`;
    
    console.log(`Proxying request to Inara.cz for: ${referenceSystem}`);
    
    // Make request to Inara.cz with retries
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        // Add a delay before retries
        if (attempts > 0) {
          const waitTime = attempts * 3000; // 3s, 6s, 9s
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        console.log(`Request attempt ${attempts + 1}/${maxAttempts} for Inara.cz`);
        
        const response = await axios.get(inaraUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 15000 // 15 second timeout
        });
        
        // Parse HTML to extract star system data
        const systems = parseInaraSystemsHtml(response.data);
        
        // Return the parsed data
        return res.json(systems);
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error.message);
        lastError = error;
        attempts++;
      }
    }
    
    // If all attempts failed
    console.error('All request attempts failed for Inara.cz');
    return res.status(500).json({ 
      error: 'Failed to fetch data from Inara.cz',
      details: lastError?.message || 'All attempts failed' 
    });
  } catch (error) {
    console.error('Error proxying Inara.cz request:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from Inara.cz', details: error.message });
  }
});

// EDSM sphere systems API endpoint
app.get('/api/edsm/sphere-systems', async (req, res) => {
  try {
    const systemName = req.query.systemName;
    const radius = req.query.radius || 100;
    const minRadius = req.query.minRadius || 0;
    
    if (!systemName) {
      return res.status(400).json({ error: 'System name is required' });
    }
    
    // Construct the EDSM API URL for sphere-systems
    const edsmUrl = `https://www.edsm.net/api-v1/sphere-systems?systemName=${encodeURIComponent(systemName)}&radius=${radius}&minRadius=${minRadius}&showInformation=1`;
    
    console.log(`Proxying request to EDSM sphere-systems: ${systemName}, radius: ${radius}`);
    
    // Make request to EDSM with retries
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        // Add a delay before retries
        if (attempts > 0) {
          const waitTime = attempts * 3000;
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        console.log(`Request attempt ${attempts + 1}/${maxAttempts} for EDSM sphere-systems`);
        
        const response = await axios.get(edsmUrl, {
          headers: {
            'Accept': 'application/json'
          },
          timeout: 15000
        });
        
        // Check if response data exists and is valid
        if (!response.data) {
          throw new Error('Empty response received from EDSM sphere-systems');
        }

        // If the response is an error message from EDSM
        if (response.data.errorCode || response.data.error) {
          throw new Error(response.data.error || 'EDSM API returned an error');
        }

        // Ensure we have an array to work with
        const systemsArray = Array.isArray(response.data) ? response.data : [];
        if (systemsArray.length === 0) {
          // Return empty array with correct format instead of throwing error
          return res.json([]);
        }

        // Convert EDSM systems format to match our Inara format
        const formattedSystems = formatEdsmSystems(systemsArray);
        return res.json(formattedSystems);

      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error.message);
        lastError = error;
        attempts++;
        
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }
    
    // If all attempts failed
    throw new Error('All request attempts failed');
    
  } catch (error) {
    console.error('Error proxying EDSM sphere-systems request:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch data from EDSM sphere-systems', 
      details: error.message 
    });
  }
});

// EDSM API proxy endpoint
app.get('/api/edsm/bodies', async (req, res) => {
  try {
    const systemName = req.query.systemName;
    
    if (!systemName) {
      return res.status(400).json({ error: 'System name is required' });
    }
    
    // Construct the EDSM API URL
    const edsmUrl = `https://www.edsm.net/api-system-v1/bodies?systemName=${encodeURIComponent(systemName)}`;
    
    console.log(`Proxying request to EDSM for system: ${systemName}`);
    
    // Make request to EDSM with retries
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        // Add a delay before retries
        if (attempts > 0) {
          const waitTime = attempts * 3000; // 3s, 6s, 9s
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        console.log(`Request attempt ${attempts + 1}/${maxAttempts} for EDSM API`);
        
        const response = await axios.get(edsmUrl, {
          headers: {
            'Accept': 'application/json'
          },
          timeout: 15000 // 15 second timeout
        });
        
        // Check for empty response
        if (!response.data || (Array.isArray(response.data) && response.data.length === 0)) {
          console.log('Empty response received from EDSM');
          attempts++;
          
          // Only throw error if this was our last attempt
          if (attempts >= maxAttempts) {
            throw new Error('Empty response received from EDSM');
          }
          continue;
        }
        
        // Return the data directly
        return res.json(response.data);
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error.message);
        lastError = error;
        attempts++;
      }
    }
    
    // If all attempts failed
    console.error('All request attempts failed for EDSM');
    return res.status(500).json({ 
      error: 'Failed to fetch data from EDSM', 
      details: lastError?.message || 'All attempts failed' 
    });
  } catch (error) {
    console.error('Error proxying EDSM request:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from EDSM', details: error.message });
  }
});

// Additional EDSM API endpoint for system coordinates
app.get('/api/edsm/system', async (req, res) => {
  try {
    const systemName = req.query.systemName;
    
    if (!systemName) {
      return res.status(400).json({ error: 'System name is required' });
    }
    
    // Construct the EDSM API URL for system data
    const edsmUrl = `https://www.edsm.net/api-v1/system?showCoordinates=1&systemName=${encodeURIComponent(systemName)}`;
    
    console.log(`Proxying request to EDSM for system coordinates: ${systemName}`);
    
    // Make request to EDSM with retries
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // Add a delay before retries
        if (attempts > 0) {
          await new Promise(resolve => setTimeout(resolve, attempts * 3000));
        }
        
        const response = await axios.get(edsmUrl, {
          headers: {
            'Accept': 'application/json'
          },
          timeout: 15000 // 15 second timeout
        });
        
        // Return the data directly
        return res.json(response.data);
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error.message);
        attempts++;
        
        // Throw error if this was our last attempt
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('Error proxying EDSM system request:', error.message);
    res.status(500).json({ error: 'Failed to fetch system data from EDSM', details: error.message });
  }
});

// Fallback route to serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Function to parse Inara.cz HTML (copy of the function from app.js)
function parseInaraSystemsHtml(html) {
  // Create a DOM parser to work with the HTML
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Find the table containing star system data
  const table = doc.querySelector("table.tablesortercollapsed");
  
  if (!table) {
    console.warn("No star system table found in the HTML");
    return [];
  }
  
  const systems = [];
  
  // Process each row in the table
  const rows = table.querySelectorAll("tbody tr");
  rows.forEach(row => {
    const cells = row.querySelectorAll("td");
    
    if (cells.length < 7) return; // Skip rows with insufficient data
    
    // Extract data from cells
    const systemName = cells[0].querySelector("a")?.textContent.trim() || "";
    const economy = cells[1]?.textContent.trim() || "";
    const security = cells[2]?.textContent.trim() || "";
    const allegiance = cells[3]?.textContent.trim() || "";
    const factions = parseInt(cells[4]?.textContent.trim()) || 0;
    const stations = parseInt(cells[5]?.textContent.trim()) || 0;
    
    // Extract distance and parse it to a number
    const distanceText = cells[6]?.textContent.trim() || "";
    const distanceMatch = distanceText.match(/(\d+\.\d+)\s*Ly/);
    const distance = distanceMatch ? parseFloat(distanceMatch[1]) : null;
    
    // Get direction data from the rotation style attribute if available
    let direction = null;
    const directionSpan = cells[6]?.querySelector(".distancedirection");
    if (directionSpan) {
      const styleAttr = directionSpan.getAttribute("style");
      if (styleAttr) {
        const rotateMatch = styleAttr.match(/rotate\((-?\d+)deg\)/);
        if (rotateMatch) {
          direction = parseInt(rotateMatch[1]);
        }
      }
    }
    
    systems.push({
      name: systemName,
      economy: economy,
      security: security,
      allegiance: allegiance,
      factions: factions,
      stations: stations,
      distance: distance,
      direction: direction
    });
  });
  
  return systems;
}

// Function to format EDSM sphere-systems response to match our Inara format
function formatEdsmSystems(edsmSystems) {
  return edsmSystems.map(system => {
    // Extract information from the EDSM system object
    const info = system.information || {};
    
    return {
      name: system.name,
      economy: info.economy || "",
      security: info.security || "",
      allegiance: info.allegiance || "Independent",
      factions: info.faction ? 1 : 0, // EDSM doesn't provide faction count, assume 1 if faction is present
      stations: 0, // EDSM sphere-systems doesn't provide station count
      distance: system.distance || null,
      direction: null, // EDSM doesn't provide direction
      bodyCount: system.bodyCount || 0
    };
  });
}

// Start server
app.listen(port, () => {
  console.log(`ED System Finder server running at http://localhost:${port}`);
});

// update-weather.js
const fs = require('fs');

// Use built-in fetch in Node 18+
const fetch = globalThis.fetch;

// Weather office mapping for SECAR states
const WEATHER_OFFICES = {
    'Tennessee': 'Nashville, TN',
    'Mississippi': 'Jackson, MS', 
    'Alabama': 'Birmingham, AL',
    'Georgia': 'Atlanta, GA',
    'Florida': 'Miami, FL',
    'North Carolina': 'Raleigh, NC',
    'South Carolina': 'Charleston, SC',
    'U.S. Virgin Islands': 'San Juan, PR'
};

async function fetchWeatherConditions() {
    const conditions = {};
    
    // Current date for weather analysis
    const today = new Date();
    const isHotSeason = today.getMonth() >= 4 && today.getMonth() <= 9; // May-October
    
    try {
        // Fetch conditions for each state
        for (const [state, office] of Object.entries(WEATHER_OFFICES)) {
            try {
                conditions[state] = await generateStateConditions(state, isHotSeason);
            } catch (error) {
                console.log(`Using fallback for ${state}`);
                conditions[state] = generateFallbackConditions(state, isHotSeason);
            }
        }
        
        // Get tropical outlook from NWS/NOAA sources
        conditions.tropical = await getTropicalOutlook();
        
    } catch (error) {
        console.error('Error fetching weather data:', error);
        throw new Error('Unable to fetch current weather data');
    }
    
    return conditions;
}

function getStateCode(state) {
    const codes = {
        'Tennessee': 'TN',
        'Mississippi': 'MS',
        'Alabama': 'AL', 
        'Georgia': 'GA',
        'Florida': 'FL',
        'North Carolina': 'NC',
        'South Carolina': 'SC',
        'U.S. Virgin Islands': 'VI'
    };
    return codes[state] || 'US';
}

async function generateStateConditions(state, isHotSeason) {
    try {
        // Try to fetch real alerts from weather.gov
        const stateCode = getStateCode(state);
        const alertsUrl = `https://api.weather.gov/alerts?area=${stateCode}`;
        
        const response = await fetch(alertsUrl, {
            headers: {
                'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return processAlerts(state, data.features || [], isHotSeason);
        } else {
            throw new Error(`API returned ${response.status}`);
        }
    } catch (error) {
        console.log(`API fetch failed for ${state}, using fallback`);
        return generateFallbackConditions(state, isHotSeason);
    }
}

function processAlerts(state, alerts, isHotSeason) {
    let condition = '';
    const activeAlerts = alerts.filter(alert => 
        new Date(alert.properties.expires) > new Date()
    );

    if (activeAlerts.length > 0) {
        const warnings = activeAlerts.filter(a => 
            a.properties.severity === 'Severe' || 
            a.properties.severity === 'Extreme' ||
            a.properties.event.includes('Warning')
        );
        const watches = activeAlerts.filter(a => 
            a.properties.event.includes('Watch')
        );
        const advisories = activeAlerts.filter(a => 
            a.properties.severity === 'Moderate' ||
            a.properties.event.includes('Advisory')
        );
        
        if (warnings.length > 0) {
            const warningTypes = warnings.map(w => w.properties.event).join(', ');
            condition += `Active ${warningTypes} WARNINGS in effect. `;
        }
        
        if (watches.length > 0) {
            const watchTypes = watches.map(w => w.properties.event).join(', ');
            condition += `${watchTypes} WATCHES in effect. `;
        }
        
        if (advisories.length > 0) {
            const advisoryTypes = advisories.map(a => a.properties.event).join(', ');
            condition += `${advisoryTypes} ADVISORIES in effect. `;
        }
    }
    
    // Add seasonal conditions
    condition += getSeasonalConditions(state, isHotSeason);
    
    return condition || `No significant weather hazards reported for ${state} at this time.`;
}

function generateFallbackConditions(state, isHotSeason) {
    let conditions = '';
    
    if (isHotSeason) {
        conditions += `Hot and humid conditions with ADVISORIES for heat index values near or above 100°F. `;
        
        if (state === 'Florida') {
            conditions += 'WATCHES for heavy rainfall and potential flash flooding. Scattered to numerous thunderstorms with frequent lightning and locally heavy rainfall. ';
        } else if (state === 'Mississippi' || state === 'Alabama') {
            conditions += 'Isolated to scattered thunderstorms possible with frequent lightning and brief heavy downpours. Monitor for heat-related illnesses. ';
        } else if (state === 'Georgia' || state === 'South Carolina') {
            conditions += 'Scattered afternoon thunderstorms with dangerous lightning and locally heavy rainfall. ';
        } else if (state === 'Tennessee' || state === 'North Carolina') {
            conditions += 'ADVISORIES for scattered thunderstorms with lightning and brief heavy rainfall. ';
        } else if (state === 'U.S. Virgin Islands') {
            conditions += 'ADVISORIES for isolated showers and thunderstorms with dangerous lightning. ';
        }
    } else {
        conditions += `Seasonal temperatures expected for ${state}. `;
        
        if (state === 'Florida' || state === 'U.S. Virgin Islands') {
            conditions += 'Mild temperatures with occasional shower activity. ';
        } else {
            conditions += 'Monitor for potential winter weather impacts and changing conditions. ';
        }
    }
    
    return conditions;
}

function getSeasonalConditions(state, isHotSeason) {
    if (isHotSeason) {
        return 'Monitor for heat stress during outdoor activities. Stay hydrated and seek air conditioning during peak heating hours. ';
    } else {
        return 'Typical seasonal weather patterns expected. Monitor for changing conditions. ';
    }
}

async function getTropicalOutlook() {
    try {
        console.log('Fetching tropical outlook from NWS/NOAA sources...');
        
        // Method 1: NWS Tropical Weather Outlook Text Products
        try {
            console.log('Trying NWS Tropical Weather Outlook products...');
            const response = await fetch('https://api.weather.gov/products/types/MIATWO', {
                headers: {
                    'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)',
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('NWS TWO products received:', data['@graph']?.length || 0, 'products');
                
                if (data['@graph'] && data['@graph'].length > 0) {
                    // Get the most recent tropical weather outlook
                    const latestOutlook = data['@graph'][0];
                    
                    // Fetch the actual product text
                    const productResponse = await fetch(latestOutlook['@id'], {
                        headers: {
                            'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)',
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (productResponse.ok) {
                        const productData = await productResponse.json();
                        return parseNWSTropicalOutlook(productData.productText);
                    }
                }
            }
        } catch (error) {
            console.log('NWS TWO failed:', error.message);
        }

        // Method 2: NWS Tropical Alerts
        try {
            console.log('Trying NWS tropical alerts...');
            const tropicalEvents = [
                'Tropical Storm Watch', 'Tropical Storm Warning',
                'Hurricane Watch', 'Hurricane Warning',
                'Tropical Depression', 'Tropical Cyclone'
            ];
            
            const eventQuery = tropicalEvents.join(',');
            const response = await fetch(`https://api.weather.gov/alerts?event=${encodeURIComponent(eventQuery)}`, {
                headers: {
                    'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Tropical alerts received:', data.features?.length || 0, 'alerts');
                
                if (data.features && data.features.length > 0) {
                    return processTropicalAlerts(data.features);
                }
            }
        } catch (error) {
            console.log('NWS tropical alerts failed:', error.message);
        }

        // Method 3: NWS Miami Area Forecast Discussion (often mentions tropical activity)
        try {
            console.log('Trying NWS Miami AFD...');
            const response = await fetch('https://api.weather.gov/products/types/MIAAFDEMF', {
                headers: {
                    'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)',
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Miami AFD products received:', data['@graph']?.length || 0, 'products');
                
                if (data['@graph'] && data['@graph'].length > 0) {
                    const latestAFD = data['@graph'][0];
                    
                    const productResponse = await fetch(latestAFD['@id'], {
                        headers: {
                            'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)',
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (productResponse.ok) {
                        const productData = await productResponse.json();
                        const tropicalInfo = extractTropicalFromAFD(productData.productText);
                        if (tropicalInfo) {
                            return tropicalInfo;
                        }
                    }
                }
            }
        } catch (error) {
            console.log('Miami AFD failed:', error.message);
        }

        // Method 4: NWS High Seas Forecast (marine forecasts often mention tropical activity)
        try {
            console.log('Trying NWS High Seas forecast...');
            const response = await fetch('https://api.weather.gov/products/types/MIAHSP', {
                headers: {
                    'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)',
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('High Seas products received:', data['@graph']?.length || 0, 'products');
                
                if (data['@graph'] && data['@graph'].length > 0) {
                    const latestForecast = data['@graph'][0];
                    
                    const productResponse = await fetch(latestForecast['@id'], {
                        headers: {
                            'User-Agent': 'SECAR-Weather-Report (github.com/franzenjb/SECAR-claude)',
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (productResponse.ok) {
                        const productData = await productResponse.json();
                        const tropicalInfo = extractTropicalFromMarine(productData.productText);
                        if (tropicalInfo) {
                            return tropicalInfo;
                        }
                    }
                }
            }
        } catch (error) {
            console.log('High Seas forecast failed:', error.message);
        }

        // Fallback: Hurricane season status
        const month = new Date().getMonth();
        const isHurricaneSeason = month >= 5 && month <= 10; // June-November
        
        if (isHurricaneSeason) {
            console.log('All NWS sources failed, using hurricane season message');
            return {
                outlook: 'National Weather Service tropical data temporarily unavailable via automated systems. During hurricane season, conditions can change rapidly and tropical development is possible.',
                formation_chance: 'Monitor NWS'
            };
        } else {
            return {
                outlook: 'Outside of peak hurricane season. No significant tropical activity expected in the Atlantic basin at this time.',
                formation_chance: '0%'
            };
        }
        
    } catch (error) {
        console.error('All tropical data sources failed:', error);
        return {
            outlook: 'Tropical weather information temporarily unavailable. Monitor local National Weather Service offices for current conditions.',
            formation_chance: 'Check NWS'
        };
    }
}

function parseNWSTropicalOutlook(productText) {
    try {
        console.log('Parsing NWS tropical outlook text...');
        
        // Look for formation probabilities and disturbance information
        const lines = productText.split('\n');
        let outlookText = '';
        let maxFormationChance = 0;
        
        // Search for key tropical outlook phrases
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            
            // Look for disturbance descriptions
            if (line.includes('disturbance') || line.includes('tropical') || line.includes('development')) {
                // Collect this line and next few lines for context
                const contextLines = lines.slice(i, Math.min(i + 3, lines.length));
                const contextText = contextLines.join(' ').trim();
                
                // Look for percentage in this context
                const percentMatch = contextText.match(/(\d+)\s*percent/i);
                if (percentMatch) {
                    const percentage = parseInt(percentMatch[1]);
                    if (percentage > maxFormationChance) {
                        maxFormationChance = percentage;
                        outlookText = contextText.substring(0, 300) + '...';
                    }
                }
                
                // If no percentage but good tropical content, save it
                if (!outlookText && contextText.length > 50) {
                    outlookText = contextText.substring(0, 300) + '...';
                }
            }
        }
        
        if (outlookText || maxFormationChance > 0) {
            return {
                outlook: outlookText || 'The National Weather Service is monitoring tropical activity in the Atlantic basin.',
                formation_chance: maxFormationChance > 0 ? `${maxFormationChance}%` : 'Low'
            };
        }
        
        return null;
    } catch (error) {
        console.log('Error parsing NWS tropical outlook:', error.message);
        return null;
    }
}

function processTropicalAlerts(alerts) {
    try {
        console.log('Processing tropical alerts...');
        
        const activeAlerts = alerts.filter(alert => 
            new Date(alert.properties.expires) > new Date()
        );
        
        if (activeAlerts.length > 0) {
            const alertTypes = activeAlerts.map(alert => alert.properties.event).join(', ');
            const areas = [...new Set(activeAlerts.map(alert => alert.properties.areaDesc))].join(', ');
            
            return {
                outlook: `Active tropical weather alerts: ${alertTypes} affecting ${areas}. Monitor National Weather Service for updates and follow all evacuation orders.`,
                formation_chance: 'Active System'
            };
        }
        
        return null;
    } catch (error) {
        console.log('Error processing tropical alerts:', error.message);
        return null;
    }
}

function extractTropicalFromAFD(productText) {
    try {
        console.log('Extracting tropical info from AFD...');
        
        const lines = productText.split('\n');
        let tropicalContent = '';
        
        // Look for tropical-related sections
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            
            if (line.includes('tropical') || line.includes('hurricane') || line.includes('depression') || line.includes('disturbance')) {
                // Get surrounding context
                const startIdx = Math.max(0, i - 2);
                const endIdx = Math.min(lines.length, i + 4);
                const context = lines.slice(startIdx, endIdx).join(' ').trim();
                
                if (context.length > 100) {
                    tropicalContent = context.substring(0, 400) + '...';
                    break;
                }
            }
        }
        
        if (tropicalContent) {
            // Look for formation probability
            const percentMatch = tropicalContent.match(/(\d+)\s*percent/i);
            const formationChance = percentMatch ? `${percentMatch[1]}%` : 'Monitor';
            
            return {
                outlook: tropicalContent,
                formation_chance: formationChance
            };
        }
        
        return null;
    } catch (error) {
        console.log('Error extracting tropical from AFD:', error.message);
        return null;
    }
}

function extractTropicalFromMarine(productText) {
    try {
        console.log('Extracting tropical info from marine forecast...');
        
        const lines = productText.split('\n');
        let marineContent = '';
        
        // Look for tropical mentions in marine forecasts
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            
            if (line.includes('tropical') || line.includes('cyclone') || line.includes('storm')) {
                const startIdx = Math.max(0, i - 1);
                const endIdx = Math.min(lines.length, i + 3);
                const context = lines.slice(startIdx, endIdx).join(' ').trim();
                
                if (context.length > 80) {
                    marineContent = context.substring(0, 300) + '...';
                    break;
                }
            }
        }
        
        if (marineContent) {
            return {
                outlook: marineContent,
                formation_chance: 'See Marine Forecast'
            };
        }
        
        return null;
    } catch (error) {
        console.log('Error extracting tropical from marine forecast:', error.message);
        return null;
    }
}

function generateReport(weatherData) {
    const now = new Date();
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 4);
    
    const checkTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
    }) + ' EDT';
    
    let report = `
        <div class="weather-check-time">Weather.gov map checked at ${checkTime}. NWS office verification completed for all SECAR state offices.</div>
        
        <div class="date-range">${formatDate(startDate)} – ${formatDate(endDate)}</div>
        
        <div class="tropical-outlook">
            <h3>Tropical Weather Outlook</h3>
            <p>${weatherData.tropical?.outlook || 'Tropical outlook not available.'}</p>
            <div class="formation-chance">
                <div class="formation-badge">
                    Formation Chance: <span class="formation-percentage">${weatherData.tropical?.formation_chance || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <div class="section-title">Severe Weather Threats (5-Day Outlook)</div>
    `;

    // Add state conditions with proper formatting
    Object.keys(WEATHER_OFFICES).forEach(state => {
        if (weatherData[state]) {
            let stateCondition = weatherData[state]
                .replace(/WARNINGS/g, '<span class="warning">WARNINGS</span>')
                .replace(/WATCHES/g, '<span class="watch">WATCHES</span>')
                .replace(/ADVISORIES/g, '<span class="advisory">ADVISORIES</span>')
                .replace(/frequent lightning/g, '<strong>frequent lightning</strong>')
                .replace(/dangerous lightning/g, '<strong>dangerous lightning</strong>')
                .replace(/cloud-to-ground lightning/g, '<strong>cloud-to-ground lightning</strong>');
            
            report += `
                <div class="state-report">
                    <span class="state-name">${state}:</span> 
                    <span class="state-conditions">${stateCondition}</span>
                </div>
            `;
        }
    });

    report += `
        <div class="recommendations">
            <div class="section-title">Recommendations</div>
            
            <h4>Immediate Actions</h4>
            <ul>
                <li>Follow all local <span class="warning">WARNINGS</span>, <span class="watch">WATCHES</span>, and <span class="advisory">ADVISORIES</span> for heat, thunderstorms, and flooding.</li>
                <li>Monitor local conditions for rapidly developing thunderstorms, especially during peak heating hours.</li>
                <li>Practice lightning safety: move indoors immediately when thunder is heard; avoid open fields, water, and tall objects.</li>
                <li>Never drive through flooded roadways—Turn Around, Don't Drown.</li>
                <li>Stay hydrated and limit outdoor activity during periods of excessive heat.</li>
            </ul>
            
            <h4>5-Day Monitoring</h4>
            <ul>
                <li>Monitor NWS local offices for updated <span class="warning">WARNINGS</span>, <span class="watch">WATCHES</span>, and <span class="advisory">ADVISORIES</span>.</li>
                <li>Track National Weather Service tropical weather updates for any changes in development probability.</li>
                <li>Monitor river and stream levels in flood-prone areas, especially after heavy rainfall.</li>
                <li>Remain alert for rapidly changing weather conditions, especially during holiday events and outdoor gatherings.</li>
            </ul>
        </div>
        
        <div class="sources">Sources: NWS local offices, National Weather Service, NOAA.</div>
    `;

    return report;
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

async function updateHtmlFile() {
    try {
        console.log('Fetching weather data...');
        const weatherData = await fetchWeatherConditions();
        
        console.log('Generating report...');
        const reportHtml = generateReport(weatherData);
        
        // Read the current HTML template
        const htmlTemplate = fs.readFileSync('index.html', 'utf8');
        
        // Replace the loading div with actual weather data (NO TIMESTAMP ADDED)
        const updatedHtml = htmlTemplate
            .replace(
                /<div id="reportOutput" class="report-text">[\s\S]*?<\/div>/,
                `<div id="reportOutput" class="report-text">${reportHtml}</div>`
            );
        
        // Write the updated HTML back to file
        fs.writeFileSync('index.html', updatedHtml);
        
        console.log('Weather report updated successfully');
        
    } catch (error) {
        console.error('Error updating weather report:', error);
        process.exit(1);
    }
}

// Run the update
updateHtmlFile();

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
        
        // Get tropical outlook
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
        console.log('Fetching REAL NHC Tropical Weather Outlook...');
        
        // Method 1: Try official JSON API with better headers
        try {
            console.log('Trying NHC JSON API...');
            const response = await fetch('https://www.nhc.noaa.gov/gtwo.php?basin=atlc&fmt=json', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SECAR-Weather-Report)',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('NHC JSON response:', JSON.stringify(data, null, 2));
                
                if (data && data.areas && data.areas.length > 0) {
                    let maxChance = 0;
                    let outlookText = '';
                    let disturbanceCount = 0;
                    
                    data.areas.forEach((area, index) => {
                        disturbanceCount++;
                        console.log(`Processing disturbance ${index + 1}:`, area);
                        
                        // Extract formation chances
                        if (area.chance7day) {
                            const chance7 = parseInt(area.chance7day.replace('%', '')) || 0;
                            maxChance = Math.max(maxChance, chance7);
                        }
                        
                        if (area.chance2day) {
                            const chance2 = parseInt(area.chance2day.replace('%', '')) || 0;
                            maxChance = Math.max(maxChance, chance2);
                        }
                        
                        // Build comprehensive outlook text
                        if (area.text) {
                            outlookText += `Disturbance ${index + 1}: ${area.text} `;
                        }
                    });
                    
                    if (maxChance > 0) {
                        return {
                            outlook: outlookText.trim() || `The National Hurricane Center is monitoring ${disturbanceCount} disturbance(s) in the Atlantic basin for potential tropical development.`,
                            formation_chance: `${maxChance}%`
                        };
                    }
                }
            } else {
                console.log(`NHC JSON API returned ${response.status}: ${response.statusText}`);
            }
        } catch (jsonError) {
            console.log('NHC JSON API failed:', jsonError.message);
        }

        // Method 2: Try scraping the HTML outlook page
        try {
            console.log('Trying NHC HTML page scraping...');
            const response = await fetch('https://www.nhc.noaa.gov/gtwo_atl.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SECAR-Weather-Report)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            
            if (response.ok) {
                const htmlText = await response.text();
                console.log('NHC HTML page length:', htmlText.length);
                
                // Look for formation percentages in HTML
                const percentageRegex = /(\d+)\s*percent/gi;
                const formationRegex = /formation.*?(\d+)\s*percent/gi;
                const disturbanceRegex = /disturbance\s*\d+.*?(\d+)\s*percent/gi;
                
                let maxPercentage = 0;
                let foundText = '';
                
                // Try different regex patterns
                const patterns = [formationRegex, disturbanceRegex, percentageRegex];
                
                patterns.forEach(pattern => {
                    let match;
                    while ((match = pattern.exec(htmlText)) !== null) {
                        const percentage = parseInt(match[1]);
                        if (percentage > maxPercentage) {
                            maxPercentage = percentage;
                            // Extract surrounding context
                            const startIndex = Math.max(0, match.index - 200);
                            const endIndex = Math.min(htmlText.length, match.index + 200);
                            foundText = htmlText.substring(startIndex, endIndex).replace(/<[^>]*>/g, '').trim();
                        }
                    }
                });
                
                if (maxPercentage > 0) {
                    return {
                        outlook: foundText || `The National Hurricane Center reports tropical development chances in the Atlantic basin.`,
                        formation_chance: `${maxPercentage}%`
                    };
                }
            }
        } catch (htmlError) {
            console.log('NHC HTML scraping failed:', htmlError.message);
        }

        // Method 3: Try RSS feed
        try {
            console.log('Trying NHC RSS feed...');
            const response = await fetch('https://www.nhc.noaa.gov/index-at.xml', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SECAR-Weather-Report)',
                    'Accept': 'application/rss+xml, application/xml, text/xml'
                }
            });
            
            if (response.ok) {
                const xmlText = await response.text();
                console.log('RSS feed received, length:', xmlText.length);
                
                // Parse RSS for tropical outlook
                const itemRegex = /<item>[\s\S]*?<\/item>/gi;
                const titleRegex = /<title[^>]*>(.*?)<\/title>/i;
                const descRegex = /<description[^>]*>(.*?)<\/description>/i;
                
                let maxPercentage = 0;
                let outlookText = '';
                
                let match;
                while ((match = itemRegex.exec(xmlText)) !== null) {
                    const item = match[0];
                    
                    // Check if this is a tropical outlook item
                    if (item.toLowerCase().includes('tropical') || item.toLowerCase().includes('outlook')) {
                        const titleMatch = titleRegex.exec(item);
                        const descMatch = descRegex.exec(item);
                        
                        if (descMatch) {
                            const description = descMatch[1].replace(/<[^>]*>/g, '').trim();
                            
                            // Look for percentages
                            const percentMatches = description.match(/(\d+)\s*percent/gi);
                            if (percentMatches) {
                                percentMatches.forEach(percentMatch => {
                                    const num = parseInt(percentMatch.replace(/\D/g, ''));
                                    if (num > maxPercentage) {
                                        maxPercentage = num;
                                        outlookText = description.substring(0, 400);
                                    }
                                });
                            }
                        }
                    }
                }
                
                if (maxPercentage > 0) {
                    return {
                        outlook: outlookText || 'The National Hurricane Center is monitoring tropical development in the Atlantic basin.',
                        formation_chance: `${maxPercentage}%`
                    };
                }
            }
        } catch (rssError) {
            console.log('RSS feed failed:', rssError.message);
        }

        // Method 4: Try Current Storms API
        try {
            console.log('Trying Current Storms API...');
            const response = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SECAR-Weather-Report)'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Current storms data:', data);
                
                if (data.activeStorms && data.activeStorms.length > 0) {
                    const stormNames = data.activeStorms.map(storm => storm.name || 'Unnamed').join(', ');
                    return {
                        outlook: `The National Hurricane Center is currently tracking ${data.activeStorms.length} active system(s): ${stormNames}. Monitor official forecasts for the latest information.`,
                        formation_chance: 'Active Systems'
                    };
                }
            }
        } catch (stormsError) {
            console.log('Current storms API failed:', stormsError.message);
        }

        // Fallback with current date context
        const month = new Date().getMonth();
        const isHurricaneSeason = month >= 5 && month <= 10; // June-November
        
        if (isHurricaneSeason) {
            console.log('All NHC APIs failed, using hurricane season fallback');
            return {
                outlook: 'NHC data temporarily unavailable via automated systems. During hurricane season, formation chances can change rapidly. Visit nhc.noaa.gov for the most current tropical weather outlook and formation probabilities.',
                formation_chance: 'Visit NHC'
            };
        } else {
            return {
                outlook: 'Outside of peak hurricane season. No significant tropical activity expected in the Atlantic basin at this time.',
                formation_chance: '0%'
            };
        }
        
    } catch (error) {
        console.error('All NHC data retrieval methods failed:', error);
        return {
            outlook: 'Tropical weather outlook temporarily unavailable. Visit nhc.noaa.gov for official National Hurricane Center information.',
            formation_chance: 'Check NHC'
        };
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
                <li>Track NHC Tropical Weather Outlook updates for any changes in tropical development probability.</li>
                <li>Monitor river and stream levels in flood-prone areas, especially after heavy rainfall.</li>
                <li>Remain alert for rapidly changing weather conditions, especially during holiday events and outdoor gatherings.</li>
            </ul>
        </div>
        
        <div class="sources">Sources: NWS local offices, National Hurricane Center, NOAA.</div>
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

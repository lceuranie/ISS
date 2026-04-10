const ISS_POSITION_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const ISS_CREW_URL = "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json";

const CREW_NATIONALITY_FALLBACKS = {
  "Anne McClain": "United States",
  "Ayers Jonny": "United States",
  "Don Pettit": "United States",
  "Kirill Peskov": "Russia",
  "Nichole Ayers": "United States",
  "Oleg Artemyev": "Russia",
  "Oleg Kononenko": "Russia",
  "Alexey Ovchinin": "Russia",
  "Ivan Vagner": "Russia",
  "Aleksandr Gorbunov": "Russia",
  "Nikolai Chub": "Russia",
  "Alexander Grebenkin": "Russia",
  "Butch Wilmore": "United States",
  "Suni Williams": "United States",
  "Sunita Williams": "United States",
  "Takuya Onishi": "Japan",
  "Kimiya Yui": "Japan",
  "Koichi Wakata": "Japan",
  "Peggy Whitson": "United States",
  "Jeanette Epps": "United States",
  "Matthew Dominick": "United States",
  "Michael Barratt": "United States",
  "Tracy Dyson": "United States",
  "Loral O'Hara": "United States",
  "Jasmin Moghbeli": "United States",
  "Andreas Mogensen": "Denmark",
  "Satoshi Furukawa": "Japan",
  "Konstantin Borisov": "Russia"
};

const elements = {
  marker: document.getElementById("iss-marker"),
  glow: document.getElementById("iss-glow"),
  altitude: document.getElementById("altitude-value"),
  velocity: document.getElementById("velocity-value"),
  period: document.getElementById("period-value"),
  latitude: document.getElementById("latitude-readout"),
  longitude: document.getElementById("longitude-readout"),
  crewList: document.getElementById("crew-list"),
  crewCount: document.getElementById("crew-count"),
  networkStatus: document.getElementById("network-status"),
  telemetryTimestamp: document.getElementById("telemetry-timestamp")
};

function projectToMap(latitude, longitude) {
  const x = ((longitude + 180) / 360) * 1000;
  const y = ((90 - latitude) / 180) * 500;
  return { x, y };
}

function computeOrbitPeriodMinutes(altitudeKm) {
  const earthRadiusKm = 6371;
  const mu = 398600.4418;
  const semiMajorAxisKm = earthRadiusKm + altitudeKm;
  const seconds = 2 * Math.PI * Math.sqrt((semiMajorAxisKm ** 3) / mu);
  return seconds / 60;
}

function formatSignedCoordinate(label, value, positive, negative) {
  const direction = value >= 0 ? positive : negative;
  return `${label} ${Math.abs(value).toFixed(2)}° ${direction}`;
}

function updateMap(latitude, longitude) {
  const { x, y } = projectToMap(latitude, longitude);
  elements.marker.setAttribute("cx", x.toFixed(2));
  elements.marker.setAttribute("cy", y.toFixed(2));
  elements.glow.setAttribute("cx", x.toFixed(2));
  elements.glow.setAttribute("cy", y.toFixed(2));
}

function setNetworkState(label, isHealthy) {
  elements.networkStatus.textContent = label;
  elements.networkStatus.style.color = isHealthy ? "var(--accent)" : "var(--warning)";
}

function renderCrew(crew) {
  if (!crew.length) {
    elements.crewCount.textContent = "0 crew";
    elements.crewList.innerHTML = '<p class="empty-state">No active ISS crew members were returned by the manifest feed.</p>';
    return;
  }

  elements.crewCount.textContent = `${crew.length} crew`;
  elements.crewList.innerHTML = crew
    .map((member) => {
      const nationality = member.country || member.nationality || CREW_NATIONALITY_FALLBACKS[member.name] || "Nationality unavailable";
      const role = member.title || member.role || member.craft || "ISS crew";

      return `
        <article class="crew-card">
          <div>
            <strong>${member.name}</strong>
            <p class="crew-role">${role}</p>
          </div>
          <p class="crew-nationality">${nationality}</p>
        </article>
      `;
    })
    .join("");
}

async function fetchPosition() {
  const response = await fetch(ISS_POSITION_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Telemetry request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchCrew() {
  const response = await fetch(ISS_CREW_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Crew request failed: ${response.status}`);
  }

  const payload = await response.json();
  const people = Array.isArray(payload.people) ? payload.people : [];
  return people.filter((person) => {
    const craft = `${person.craft || ""}`.toLowerCase();
    const location = `${person.location || ""}`.toLowerCase();
    return craft.includes("iss") || location.includes("iss");
  });
}

async function refreshTelemetry() {
  try {
    const position = await fetchPosition();
    const latitude = Number(position.latitude);
    const longitude = Number(position.longitude);
    const altitude = Number(position.altitude);
    const velocity = Number(position.velocity);
    const period = computeOrbitPeriodMinutes(altitude);

    updateMap(latitude, longitude);
    elements.altitude.textContent = `${altitude.toFixed(1)} km`;
    elements.velocity.textContent = `${Math.round(velocity).toLocaleString()} km/h`;
    elements.period.textContent = `${period.toFixed(1)} min`;
    elements.latitude.textContent = formatSignedCoordinate("Lat", latitude, "N", "S");
    elements.longitude.textContent = formatSignedCoordinate("Lon", longitude, "E", "W");
    elements.telemetryTimestamp.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setNetworkState("Live", true);
  } catch (error) {
    console.error(error);
    setNetworkState("Degraded", false);
    elements.telemetryTimestamp.textContent = "Telemetry unavailable";
  }
}

async function refreshCrew() {
  try {
    const crew = await fetchCrew();
    renderCrew(crew);
  } catch (error) {
    console.error(error);
    elements.crewCount.textContent = "Manifest offline";
    elements.crewList.innerHTML = '<p class="empty-state">Crew manifest could not be loaded from the live feed.</p>';
  }
}

refreshTelemetry();
refreshCrew();

setInterval(refreshTelemetry, 10000);
setInterval(refreshCrew, 300000);

function formatSignedCoordinate(label, value, positive, negative) {
  const direction = value >= 0 ? positive : negative;
  return `${label} ${Math.abs(value).toFixed(2)} deg ${direction}`;
}

function renderCrew(crew) {
  if (!crew.length) {
    elements.crewCount.textContent = "0 crew";
    elements.crewList.innerHTML = '<p class="empty-state">No active ISS crew members were returned by the manifest feed.</p>';
    return;
  }

  elements.crewCount.textContent = `${crew.length} crew`;
  elements.crewList.innerHTML = crew
    .map((member) => {
      const nationality = member.country || member.nationality || CREW_NATIONALITY_FALLBACKS[member.name] || "Nationality unavailable";
      const role = member.position || member.title || member.role || member.spacecraft || member.craft || "ISS crew";

      return `
        <article class="crew-card">
          <div>
            <strong>${member.name}</strong>
            <p class="crew-role">${role}</p>
          </div>
          <p class="crew-nationality">${nationality}</p>
        </article>
      `;
    })
    .join("");
}

async function fetchCrew() {
  const response = await fetch(ISS_CREW_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Crew request failed: ${response.status}`);
  }

  const payload = await response.json();
  const people = Array.isArray(payload.people) ? payload.people : [];
  return people.filter((person) => {
    const craft = `${person.craft || ""}`.toLowerCase();
    const spacecraft = `${person.spacecraft || ""}`.toLowerCase();
    const location = `${person.location || ""}`.toLowerCase();
    return person.iss === true || craft.includes("iss") || spacecraft.includes("iss") || location.includes("iss");
  });
}

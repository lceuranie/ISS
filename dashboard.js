const ISS_POSITION_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const ISS_CREW_URL = "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json";
const ISS_INCLINATION_DEG = 51.64;
const EARTH_ROTATION_RAD_PER_SEC = (2 * Math.PI) / 86164;

const CREW_NATIONALITY_FALLBACKS = {
  "Anne McClain": "United States",
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
  track: document.getElementById("iss-ground-track"),
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

let previousTelemetry = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function normalizeRadians(angle) {
  let normalized = angle;
  while (normalized <= -Math.PI) {
    normalized += 2 * Math.PI;
  }
  while (normalized > Math.PI) {
    normalized -= 2 * Math.PI;
  }
  return normalized;
}

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
  return `${label} ${Math.abs(value).toFixed(2)} deg ${direction}`;
}

function updateMap(latitude, longitude) {
  const { x, y } = projectToMap(latitude, longitude);
  elements.marker.setAttribute("cx", x.toFixed(2));
  elements.marker.setAttribute("cy", y.toFixed(2));
  elements.glow.setAttribute("cx", x.toFixed(2));
  elements.glow.setAttribute("cy", y.toFixed(2));
}

function buildGroundTrackPath(latitude, longitude, altitudeKm, ascending) {
  const inclination = toRadians(ISS_INCLINATION_DEG);
  const latitudeRad = toRadians(latitude);
  const longitudeRad = toRadians(longitude);
  const periodSeconds = computeOrbitPeriodMinutes(altitudeKm) * 60;
  const meanMotion = (2 * Math.PI) / periodSeconds;
  const sinU = clamp(Math.sin(latitudeRad) / Math.sin(inclination), -1, 1);
  const ascendingCandidate = Math.asin(sinU);
  const descendingCandidate = Math.PI - ascendingCandidate;

  let argumentOfLatitude = ascending ? ascendingCandidate : descendingCandidate;
  if ((ascending && Math.cos(argumentOfLatitude) < 0) || (!ascending && Math.cos(argumentOfLatitude) > 0)) {
    argumentOfLatitude = normalizeRadians(Math.PI - argumentOfLatitude);
  }

  const inertialLongitude = Math.atan2(
    Math.sin(argumentOfLatitude) * Math.cos(inclination),
    Math.cos(argumentOfLatitude)
  );
  const ascendingNodeLongitude = normalizeRadians(longitudeRad - inertialLongitude);

  const points = [];
  const stepSeconds = 60;
  for (let deltaSeconds = -periodSeconds / 2; deltaSeconds <= periodSeconds / 2; deltaSeconds += stepSeconds) {
    const u = argumentOfLatitude + (meanMotion * deltaSeconds);
    const pointLatitude = Math.asin(Math.sin(inclination) * Math.sin(u));
    const pointLongitude = normalizeRadians(
      ascendingNodeLongitude +
      Math.atan2(Math.sin(u) * Math.cos(inclination), Math.cos(u)) -
      (EARTH_ROTATION_RAD_PER_SEC * deltaSeconds)
    );

    points.push(projectToMap(toDegrees(pointLatitude), toDegrees(pointLongitude)));
  }

  let path = "";
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previousPoint = points[index - 1];
    const command = !previousPoint || Math.abs(point.x - previousPoint.x) > 500 ? "M" : "L";
    path += `${command}${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
  }

  return path.trim();
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
    const spacecraft = `${person.spacecraft || ""}`.toLowerCase();
    const location = `${person.location || ""}`.toLowerCase();
    return person.iss === true || craft.includes("iss") || spacecraft.includes("iss") || location.includes("iss");
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
    const now = Date.now();
    const ascending = previousTelemetry ? latitude >= previousTelemetry.latitude : true;

    updateMap(latitude, longitude);
    elements.track.setAttribute("d", buildGroundTrackPath(latitude, longitude, altitude, ascending));
    elements.altitude.textContent = `${altitude.toFixed(1)} km`;
    elements.velocity.textContent = `${Math.round(velocity).toLocaleString()} km/h`;
    elements.period.textContent = `${period.toFixed(1)} min`;
    elements.latitude.textContent = formatSignedCoordinate("Lat", latitude, "N", "S");
    elements.longitude.textContent = formatSignedCoordinate("Lon", longitude, "E", "W");
    elements.telemetryTimestamp.textContent = new Date(now).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setNetworkState("Live", true);
    previousTelemetry = { latitude, longitude, timestamp: now };
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

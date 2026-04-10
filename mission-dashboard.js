const ISS_POSITION_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const ISS_CREW_URL = "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json";
const ISS_POSITIONS_URL = "https://api.wheretheiss.at/v1/satellites/25544/positions";
const DOCKING_EVENTS_URL = "https://ll.thespacedevs.com/2.1.0/docking_event/?limit=30&mode=detailed&ordering=-docking";
const ISS_INCLINATION_DEG = 51.64;
const EARTH_ROTATION_RAD_PER_SEC = (2 * Math.PI) / 86164;
const EARTH_RADIUS_KM = 6371;
const LAST_REBOOST_ISO = "2026-03-13T15:58:00Z";

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

const OFFICIAL_CREW_LINKS = {
  "Christopher Williams": "https://www.nasa.gov/humans-in-space/astronauts/nasa-astronaut-christopher-l-williams/",
  "Christoper Williams": "https://www.nasa.gov/humans-in-space/astronauts/nasa-astronaut-christopher-l-williams/",
  "Jessica Meir": "https://www.nasa.gov/humans-in-space/astronauts/jessica-u-meir/",
  "Jack Hathaway": "https://www.nasa.gov/humans-in-space/astronauts/nasa-astronaut-jack-hathaway/",
  "Sophie Adenot": "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Astronauts/Sophie_Adenot",
  "Sergey Kud-Sverchkov": "https://www.gctc.ru/print.php?id=6837",
  "Sergei Kud-Sverchkov": "https://www.gctc.ru/print.php?id=6837",
  "Sergey Mikayev": "https://www.gctc.ru/print.php?id=7037",
  "Sergei Mikaev": "https://www.gctc.ru/print.php?id=7037",
  "Andrey Fedyaev": "https://www.gctc.ru/main.php?id=7442"
};

const state = {
  previousTelemetry: null,
  userLocation: null,
  hoverVisible: false,
  latestDockingEvents: [],
  latestCrew: [],
  latestPosition: null
};

const elements = {
  mapFrame: document.getElementById("map-frame"),
  marker: document.getElementById("iss-marker"),
  glow: document.getElementById("iss-glow"),
  track: document.getElementById("iss-ground-track"),
  nightOverlay: document.getElementById("night-overlay"),
  terminatorLine: document.getElementById("terminator-line"),
  hoverCard: document.getElementById("iss-hover-card"),
  altitude: document.getElementById("altitude-value"),
  velocity: document.getElementById("velocity-value"),
  period: document.getElementById("period-value"),
  latitude: document.getElementById("latitude-readout"),
  longitude: document.getElementById("longitude-readout"),
  crewList: document.getElementById("crew-list"),
  crewCount: document.getElementById("crew-count"),
  dockedVehicles: document.getElementById("docked-vehicles"),
  nextTraffic: document.getElementById("next-traffic"),
  tdrsStatus: document.getElementById("tdrs-status"),
  tdrsDetail: document.getElementById("tdrs-detail"),
  solarAlpha: document.getElementById("solar-alpha"),
  solarBeta: document.getElementById("solar-beta"),
  reboostCountdown: document.getElementById("reboost-countdown"),
  reboostDetail: document.getElementById("reboost-detail"),
  passSummary: document.getElementById("pass-summary"),
  passDetail: document.getElementById("pass-detail"),
  daylightState: document.getElementById("daylight-state"),
  activitySummary: document.getElementById("activity-summary"),
  activityList: document.getElementById("activity-list"),
  useLocationButton: document.getElementById("use-location-button"),
  networkStatus: document.getElementById("network-status"),
  telemetryTimestamp: document.getElementById("telemetry-timestamp")
};

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

function normalizeDegrees(angle) {
  let normalized = angle;
  while (normalized <= -180) {
    normalized += 360;
  }
  while (normalized > 180) {
    normalized -= 360;
  }
  return normalized;
}

function projectToMap(latitude, longitude) {
  const x = ((longitude + 180) / 360) * 1000;
  const y = ((90 - latitude) / 180) * 500;
  return { x, y };
}

function computeOrbitPeriodMinutes(altitudeKm) {
  const mu = 398600.4418;
  const semiMajorAxisKm = EARTH_RADIUS_KM + altitudeKm;
  const seconds = 2 * Math.PI * Math.sqrt((semiMajorAxisKm ** 3) / mu);
  return seconds / 60;
}

function formatSignedCoordinate(label, value, positive, negative) {
  const direction = value >= 0 ? positive : negative;
  return `${label} ${Math.abs(value).toFixed(2)} deg ${direction}`;
}

function setNetworkState(label, isHealthy) {
  elements.networkStatus.textContent = label;
  elements.networkStatus.style.color = isHealthy ? "var(--accent)" : "var(--warning)";
}

function updateMarkerPosition(latitude, longitude) {
  const { x, y } = projectToMap(latitude, longitude);
  elements.marker.setAttribute("cx", x.toFixed(2));
  elements.marker.setAttribute("cy", y.toFixed(2));
  elements.glow.setAttribute("cx", x.toFixed(2));
  elements.glow.setAttribute("cy", y.toFixed(2));

  if (state.hoverVisible) {
    positionHoverCard(x, y);
  }
}

function positionHoverCard(x, y) {
  const cardWidth = 320;
  const cardHeight = 190;
  const left = clamp(x + 22, 12, 1000 - cardWidth - 12);
  const top = clamp(y - cardHeight - 16, 12, 500 - cardHeight - 12);
  elements.hoverCard.style.left = `${(left / 1000) * 100}%`;
  elements.hoverCard.style.top = `${(top / 500) * 100}%`;
}

function showHoverCard() {
  state.hoverVisible = true;
  elements.hoverCard.hidden = false;
  positionHoverCard(
    Number(elements.marker.getAttribute("cx")),
    Number(elements.marker.getAttribute("cy"))
  );
}

function hideHoverCard() {
  state.hoverVisible = false;
  elements.hoverCard.hidden = true;
}

function getOrbitGeometry(latitude, longitude, altitudeKm, ascending) {
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

  return {
    inclination,
    periodSeconds,
    meanMotion,
    argumentOfLatitude,
    ascendingNodeLongitude: normalizeRadians(longitudeRad - inertialLongitude)
  };
}

function buildGroundTrackPath(latitude, longitude, altitudeKm, ascending) {
  const geometry = getOrbitGeometry(latitude, longitude, altitudeKm, ascending);
  const points = [];
  const stepSeconds = 60;

  for (let deltaSeconds = -geometry.periodSeconds / 2; deltaSeconds <= geometry.periodSeconds / 2; deltaSeconds += stepSeconds) {
    const u = geometry.argumentOfLatitude + (geometry.meanMotion * deltaSeconds);
    const pointLatitude = Math.asin(Math.sin(geometry.inclination) * Math.sin(u));
    const pointLongitude = normalizeRadians(
      geometry.ascendingNodeLongitude +
      Math.atan2(Math.sin(u) * Math.cos(geometry.inclination), Math.cos(u)) -
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

  return {
    geometry,
    path: path.trim()
  };
}

function buildTerminatorData(solarLatitude, solarLongitude) {
  const solarLatRad = toRadians(solarLatitude);
  const points = [];

  for (let longitude = -180; longitude <= 180; longitude += 4) {
    const latitude = Math.abs(Math.tan(solarLatRad)) < 1e-6
      ? 0
      : toDegrees(Math.atan(-Math.cos(toRadians(longitude - solarLongitude)) / Math.tan(solarLatRad)));
    points.push(projectToMap(latitude, longitude));
  }

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const overlayStart = solarLatitude >= 0 ? "M0 500 L1000 500" : "M0 0 L1000 0";
  const overlayPath = `${overlayStart} ${points.slice().reverse().map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`;

  return {
    linePath,
    overlayPath
  };
}

function formatRelativeCountdown(targetDate) {
  const diffMs = targetDate.getTime() - Date.now();
  if (diffMs <= 0) {
    return "now";
  }

  const totalMinutes = Math.round(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days) {
    parts.push(`${days}d`);
  }
  if (hours || days) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatEventDate(isoString) {
  return new Date(isoString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderCrew(crew) {
  if (!crew.length) {
    elements.crewCount.textContent = "0 crew";
    elements.crewList.innerHTML = '<p class="empty-state">No active ISS crew members were returned by the manifest feed.</p>';
    return;
  }

  elements.crewCount.textContent = `${crew.length} crew`;
  elements.crewList.innerHTML = crew.map((member) => {
    const nationality = member.country || member.nationality || CREW_NATIONALITY_FALLBACKS[member.name] || "Nationality unavailable";
    const role = member.position || member.title || member.role || member.spacecraft || member.craft || "ISS crew";
    const profileUrl = OFFICIAL_CREW_LINKS[member.name] || member.url || "";

    return `
      <article class="crew-card">
        <div>
          <strong>${member.name}</strong>
          <p class="crew-role">${role}</p>
          <div class="crew-links">
            ${profileUrl ? `<a href="${profileUrl}" target="_blank" rel="noreferrer">Astronaut page</a>` : ""}
          </div>
        </div>
        <p class="crew-nationality">${nationality}</p>
      </article>
    `;
  }).join("");
}

function renderDockingData(events) {
  state.latestDockingEvents = events;
  const now = new Date();
  const docked = events.filter((event) => {
    const docking = event.docking ? new Date(event.docking) : null;
    const departure = event.departure ? new Date(event.departure) : null;
    return docking && docking <= now && (!departure || departure > now);
  });

  const nextArrival = events
    .filter((event) => event.docking && new Date(event.docking) > now)
    .sort((left, right) => new Date(left.docking) - new Date(right.docking))[0];
  const nextDeparture = docked
    .filter((event) => event.departure)
    .sort((left, right) => new Date(left.departure) - new Date(right.departure))[0];

  elements.dockedVehicles.innerHTML = docked.length
    ? docked.map((event) => {
      const vehicleName = event.flight_vehicle?.spacecraft?.name || event.flight_vehicle?.name || "Visiting vehicle";
      const vehicleType = event.flight_vehicle?.spacecraft?.spacecraft_config?.type?.name || "Docked";
      return `
        <div class="vehicle-row">
          <div>
            <strong>${vehicleName}</strong>
            <p class="telemetry-note">${vehicleType}</p>
          </div>
          <p class="telemetry-note">Docked ${formatEventDate(event.docking)}</p>
        </div>
      `;
    }).join("")
    : '<p class="empty-state">Live docked vehicle data is unavailable right now.</p>';

  const traffic = [];
  if (nextArrival) {
    const vehicleName = nextArrival.flight_vehicle?.spacecraft?.name || nextArrival.flight_vehicle?.name || "Upcoming arrival";
    traffic.push(`
      <div class="traffic-row">
        <div>
          <strong>Next arrival: ${vehicleName}</strong>
          <p class="telemetry-note">${formatEventDate(nextArrival.docking)}</p>
        </div>
        <p class="telemetry-note">${formatRelativeCountdown(new Date(nextArrival.docking))}</p>
      </div>
    `);
  }
  if (nextDeparture) {
    const vehicleName = nextDeparture.flight_vehicle?.spacecraft?.name || nextDeparture.flight_vehicle?.name || "Upcoming departure";
    traffic.push(`
      <div class="traffic-row">
        <div>
          <strong>Next departure: ${vehicleName}</strong>
          <p class="telemetry-note">${formatEventDate(nextDeparture.departure)}</p>
        </div>
        <p class="telemetry-note">${formatRelativeCountdown(new Date(nextDeparture.departure))}</p>
      </div>
    `);
  }

  elements.nextTraffic.innerHTML = traffic.length
    ? traffic.join("")
    : '<p class="empty-state">No upcoming visiting vehicle traffic was returned by the live schedule feed.</p>';
}

function renderActivitySummary() {
  const crewCount = state.latestCrew.length;
  const position = state.latestPosition;
  const upcomingDocking = state.latestDockingEvents
    .filter((event) => event.docking && new Date(event.docking) > new Date())
    .sort((left, right) => new Date(left.docking) - new Date(right.docking))[0];
  const dockedCount = state.latestDockingEvents.filter((event) => {
    const docking = event.docking ? new Date(event.docking) : null;
    const departure = event.departure ? new Date(event.departure) : null;
    return docking && docking <= new Date() && (!departure || departure > new Date());
  }).length;

  if (!crewCount && !position) {
    elements.activitySummary.textContent = "Awaiting mission context";
    elements.activityList.innerHTML = '<p class="empty-state">Crew activity will populate when live crew and orbital data arrive.</p>';
    return;
  }

  const tasks = [
    `${crewCount || "Current"} crew members are cycling through science operations, systems checks, exercise, and daily maintenance.`,
    dockedCount
      ? `${dockedCount} visiting vehicle${dockedCount > 1 ? "s are" : " is"} currently attached, so cargo transfer and vehicle monitoring may be part of today’s timeline.`
      : "No active cargo transfer is evident from docked-vehicle status, so the timeline is likely weighted toward research and station upkeep.",
    position && position.visibility === "daylight"
      ? "The station is in daylight now, which supports Earth-observation windows and external visual checks."
      : "The station is in orbital night now, so interior science, planning, and maintenance work are likely taking priority."
  ];

  if (upcomingDocking) {
    const vehicleName = upcomingDocking.flight_vehicle?.spacecraft?.name || upcomingDocking.flight_vehicle?.name || "upcoming vehicle";
    tasks.push(`Crew prep may be underway for ${vehicleName}, currently the next scheduled arrival.`);
  }

  elements.activitySummary.textContent = "Current task estimate from live station context";
  elements.activityList.innerHTML = tasks
    .map((task) => `<div class="traffic-row"><p>${task}</p></div>`)
    .join("");
}

function updateOpsTelemetry(position, geometry) {
  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  const solarLatitude = Number(position.solar_lat ?? 0);
  const solarLongitude = Number(position.solar_lon ?? 0);
  const daysSinceReboost = Math.floor((Date.now() - new Date(LAST_REBOOST_ISO).getTime()) / 86400000);
  const sunVector = {
    x: Math.cos(toRadians(solarLatitude)) * Math.cos(toRadians(solarLongitude)),
    y: Math.cos(toRadians(solarLatitude)) * Math.sin(toRadians(solarLongitude)),
    z: Math.sin(toRadians(solarLatitude))
  };
  const planeNormal = {
    x: Math.sin(geometry.inclination) * Math.sin(geometry.ascendingNodeLongitude),
    y: -Math.sin(geometry.inclination) * Math.cos(geometry.ascendingNodeLongitude),
    z: Math.cos(geometry.inclination)
  };
  const betaAngle = toDegrees(Math.asin(clamp(
    (planeNormal.x * sunVector.x) + (planeNormal.y * sunVector.y) + (planeNormal.z * sunVector.z),
    -1,
    1
  )));
  const alphaAngle = normalizeDegrees(solarLongitude - longitude);
  const tdrsLive = Math.abs(latitude) < 50;

  elements.tdrsStatus.textContent = tdrsLive ? "Live" : "LOS";
  elements.tdrsStatus.style.color = tdrsLive ? "var(--accent)" : "var(--warning)";
  elements.tdrsDetail.textContent = tdrsLive
    ? "Ku-band relay coverage looks healthy through TDRS."
    : "Brief loss-of-signal windows are more likely near the orbital latitude extremes.";
  elements.solarAlpha.textContent = `Alpha ${alphaAngle.toFixed(1)} deg`;
  elements.solarBeta.textContent = `Beta ${betaAngle.toFixed(1)} deg estimated sun-angle`;
  elements.reboostCountdown.textContent = `${daysSinceReboost} days since last reboost`;
  elements.reboostDetail.textContent = `Reference reboost: ${formatEventDate(LAST_REBOOST_ISO)} by Progress 93.`;
  elements.daylightState.textContent = position.visibility === "daylight" ? "Station in daylight" : "Station in orbital night";
}

function updateDayNightOverlay(position) {
  const solarLatitude = Number(position.solar_lat ?? 0);
  const solarLongitude = Number(position.solar_lon ?? 0);
  const terminator = buildTerminatorData(solarLatitude, solarLongitude);
  elements.nightOverlay.setAttribute("d", terminator.overlayPath);
  elements.terminatorLine.setAttribute("d", terminator.linePath);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchPosition() {
  return fetchJson(ISS_POSITION_URL);
}

async function fetchCrew() {
  const payload = await fetchJson(ISS_CREW_URL);
  const people = Array.isArray(payload.people) ? payload.people : [];
  return people.filter((person) => {
    const craft = `${person.craft || ""}`.toLowerCase();
    const spacecraft = `${person.spacecraft || ""}`.toLowerCase();
    const location = `${person.location || ""}`.toLowerCase();
    return person.iss === true || craft.includes("iss") || spacecraft.includes("iss") || location.includes("iss");
  });
}

async function fetchDockingEvents() {
  const payload = await fetchJson(DOCKING_EVENTS_URL);
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.filter((event) => `${event.flight_vehicle?.destination || ""}`.toLowerCase().includes("international space station"));
}

function getAstronomyData(date) {
  const julianDay = (date.getTime() / 86400000) + 2440587.5;
  const n = julianDay - 2451545.0;
  const meanLongitude = normalizeDegrees(280.460 + (0.9856474 * n));
  const meanAnomaly = normalizeDegrees(357.528 + (0.9856003 * n));
  const eclipticLongitude = meanLongitude + (1.915 * Math.sin(toRadians(meanAnomaly))) + (0.020 * Math.sin(toRadians(2 * meanAnomaly)));
  const obliquity = 23.439 - (0.0000004 * n);
  const rightAscension = toDegrees(Math.atan2(
    Math.cos(toRadians(obliquity)) * Math.sin(toRadians(eclipticLongitude)),
    Math.cos(toRadians(eclipticLongitude))
  ));
  const declination = toDegrees(Math.asin(Math.sin(toRadians(obliquity)) * Math.sin(toRadians(eclipticLongitude))));
  const gmst = normalizeDegrees(280.46061837 + (360.98564736629 * (julianDay - 2451545)));
  const subsolarLongitude = normalizeDegrees(rightAscension - gmst);

  return {
    declination,
    subsolarLongitude
  };
}

function solarElevationAt(date, latitude, longitude) {
  const astronomy = getAstronomyData(date);
  const hourAngle = normalizeDegrees(longitude - astronomy.subsolarLongitude);
  return toDegrees(Math.asin(
    (Math.sin(toRadians(latitude)) * Math.sin(toRadians(astronomy.declination))) +
    (Math.cos(toRadians(latitude)) * Math.cos(toRadians(astronomy.declination)) * Math.cos(toRadians(hourAngle)))
  ));
}

function centralAngleDegrees(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lon2 - lon1);
  return toDegrees(Math.acos(clamp(
    (Math.sin(phi1) * Math.sin(phi2)) + (Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)),
    -1,
    1
  )));
}

async function fetchFuturePositions(startUnix, hoursAhead, stepMinutes) {
  const timestamps = [];
  for (let offsetMinutes = 0; offsetMinutes <= hoursAhead * 60; offsetMinutes += stepMinutes) {
    timestamps.push(startUnix + (offsetMinutes * 60));
  }

  const batches = [];
  for (let index = 0; index < timestamps.length; index += 10) {
    batches.push(timestamps.slice(index, index + 10));
  }

  const points = [];
  for (const batch of batches) {
    const url = `${ISS_POSITIONS_URL}?timestamps=${batch.join(",")}&units=kilometers`;
    const batchPoints = await fetchJson(url);
    if (Array.isArray(batchPoints)) {
      points.push(...batchPoints);
    }
  }
  return points;
}

async function estimateNextVisiblePass() {
  if (!state.userLocation) {
    return;
  }

  elements.passSummary.textContent = "Calculating next pass...";
  elements.passDetail.textContent = "Sampling upcoming ISS ground track segments for your location.";

  try {
    const startUnix = Math.floor(Date.now() / 1000);
    const positions = await fetchFuturePositions(startUnix, 12, 5);
    const visiblePoint = positions.find((point) => {
      const timestamp = new Date(Number(point.timestamp) * 1000);
      const altitudeKm = Number(point.altitude || 420);
      const horizonAngle = toDegrees(Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm)));
      const separation = centralAngleDegrees(
        state.userLocation.latitude,
        state.userLocation.longitude,
        Number(point.latitude),
        Number(point.longitude)
      );
      const darkEnough = solarElevationAt(timestamp, state.userLocation.latitude, state.userLocation.longitude) < -6;
      const issSunlit = `${point.visibility || ""}`.toLowerCase() !== "eclipsed";
      return separation <= horizonAngle && darkEnough && issSunlit;
    });

    if (!visiblePoint) {
      elements.passSummary.textContent = `No visible pass in the next 12 hours for ${state.userLocation.label}`;
      elements.passDetail.textContent = "Try again later or allow more time for the orbit prediction window.";
      return;
    }

    const passDate = new Date(Number(visiblePoint.timestamp) * 1000);
    elements.passSummary.textContent = `Next visible pass over ${state.userLocation.label}: ${formatRelativeCountdown(passDate)}`;
    elements.passDetail.textContent = `${formatEventDate(passDate.toISOString())} local time estimate, ISS sunlit and your sky dark enough.`;
  } catch (error) {
    console.error(error);
    elements.passSummary.textContent = `Unable to estimate pass for ${state.userLocation.label}`;
    elements.passDetail.textContent = "The future-position feed is unavailable right now.";
  }
}

function requestUserLocation() {
  if (!navigator.geolocation) {
    elements.passSummary.textContent = "Geolocation unavailable";
    elements.passDetail.textContent = "Your browser does not support location lookup for pass estimation.";
    return;
  }

  elements.passSummary.textContent = "Waiting for location permission...";
  elements.passDetail.textContent = "Share your location to estimate the next visible ISS pass over you.";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: `${position.coords.latitude.toFixed(2)} deg, ${position.coords.longitude.toFixed(2)} deg`
      };
      estimateNextVisiblePass();
    },
    () => {
      elements.passSummary.textContent = "Location permission denied";
      elements.passDetail.textContent = "Enable browser location access to personalize the pass countdown.";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
  );
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
    const ascending = state.previousTelemetry ? latitude >= state.previousTelemetry.latitude : true;
    const trackData = buildGroundTrackPath(latitude, longitude, altitude, ascending);

    updateMarkerPosition(latitude, longitude);
    updateDayNightOverlay(position);
    elements.track.setAttribute("d", trackData.path);
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
    updateOpsTelemetry(position, trackData.geometry);
    setNetworkState("Live", true);
    state.latestPosition = position;
    state.previousTelemetry = { latitude, longitude, timestamp: now };
    renderActivitySummary();
  } catch (error) {
    console.error(error);
    setNetworkState("Degraded", false);
    elements.telemetryTimestamp.textContent = "Telemetry unavailable";
  }
}

async function refreshCrew() {
  try {
    const crew = await fetchCrew();
    state.latestCrew = crew;
    renderCrew(crew);
    renderActivitySummary();
  } catch (error) {
    console.error(error);
    elements.crewCount.textContent = "Manifest offline";
    elements.crewList.innerHTML = '<p class="empty-state">Crew manifest could not be loaded from the live feed.</p>';
  }
}

async function refreshDocking() {
  try {
    renderDockingData(await fetchDockingEvents());
    renderActivitySummary();
  } catch (error) {
    console.error(error);
    elements.dockedVehicles.innerHTML = '<p class="empty-state">Docked vehicle data could not be loaded from the live schedule feed.</p>';
    elements.nextTraffic.innerHTML = '<p class="empty-state">Upcoming vehicle traffic could not be loaded from the live schedule feed.</p>';
  }
}

elements.marker.addEventListener("mouseenter", showHoverCard);
elements.marker.addEventListener("focus", showHoverCard);
elements.marker.addEventListener("blur", hideHoverCard);
elements.mapFrame.addEventListener("mouseleave", hideHoverCard);
elements.useLocationButton.addEventListener("click", requestUserLocation);

refreshTelemetry();
refreshCrew();
refreshDocking();

setInterval(refreshTelemetry, 10000);
setInterval(refreshCrew, 300000);
setInterval(refreshDocking, 600000);

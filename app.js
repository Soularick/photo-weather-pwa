const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const DEMO_LOCATION = {
  latitude: 22.3193,
  longitude: 114.1694,
  label: "示例位置",
};
const LOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 12000,
  maximumAge: 1000 * 60 * 30,
};
const NEARBY_POINTS = [
  ["北侧", 0, 12],
  ["东北侧", 45, 14],
  ["东侧", 90, 12],
  ["东南侧", 135, 14],
  ["南侧", 180, 12],
  ["西南侧", 225, 14],
  ["西侧", 270, 12],
  ["西北侧", 315, 14],
];

const $ = (id) => document.getElementById(id);

const elements = {
  refreshButton: $("refreshButton"),
  heroPanel: $("heroPanel"),
  placeLabel: $("placeLabel"),
  summaryTitle: $("summaryTitle"),
  summaryMeta: $("summaryMeta"),
  dawnScore: $("dawnScore"),
  sunsetScore: $("sunsetScore"),
  fireScore: $("fireScore"),
  starsScore: $("starsScore"),
  dawnMeter: $("dawnMeter"),
  sunsetMeter: $("sunsetMeter"),
  fireMeter: $("fireMeter"),
  starsMeter: $("starsMeter"),
  dawnTime: $("dawnTime"),
  sunsetTime: $("sunsetTime"),
  fireTime: $("fireTime"),
  starsTime: $("starsTime"),
  dawnReason: $("dawnReason"),
  sunsetReason: $("sunsetReason"),
  fireReason: $("fireReason"),
  starsReason: $("starsReason"),
  timezoneLabel: $("timezoneLabel"),
  morningBlue: $("morningBlue"),
  eveningBlue: $("eveningBlue"),
  updatedAt: $("updatedAt"),
  cloudMetric: $("cloudMetric"),
  highCloudMetric: $("highCloudMetric"),
  rainMetric: $("rainMetric"),
  visibilityMetric: $("visibilityMetric"),
  statusLine: $("statusLine"),
  sheetBackdrop: $("sheetBackdrop"),
  detailSheet: $("detailSheet"),
  closeSheet: $("closeSheet"),
  sheetKicker: $("sheetKicker"),
  sheetTitle: $("sheetTitle"),
  sheetScore: $("sheetScore"),
  sheetSubtitle: $("sheetSubtitle"),
  sheetMapFrame: $("sheetMapFrame"),
  sheetModel: $("sheetModel"),
  sheetMetrics: $("sheetMetrics"),
  sheetUpdated: $("sheetUpdated"),
  sheetInsights: $("sheetInsights"),
  nearbySection: $("nearbySection"),
  nearbyTitle: $("nearbyTitle"),
  externalMapLink: $("externalMapLink"),
  nearbyList: $("nearbyList"),
};

let locationLabel = "";
let appState = null;
let activeDetail = "overview";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function formatKm(meters) {
  if (!Number.isFinite(meters)) return "--";
  return `${Math.round(meters / 100) / 10} km`;
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function midpoint(start, end) {
  return new Date((start.getTime() + end.getTime()) / 2);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseWeatherTime(value) {
  return new Date(value);
}

function readHourlyAt(hourly, date) {
  const target = date.getTime();
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  hourly.time.forEach((iso, index) => {
    const distance = Math.abs(parseWeatherTime(iso).getTime() - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return {
    cloud: hourly.cloud_cover?.[bestIndex] ?? 50,
    lowCloud: hourly.cloud_cover_low?.[bestIndex] ?? 45,
    midCloud: hourly.cloud_cover_mid?.[bestIndex] ?? 35,
    highCloud: hourly.cloud_cover_high?.[bestIndex] ?? 35,
    rainChance: hourly.precipitation_probability?.[bestIndex] ?? 0,
    visibility: hourly.visibility?.[bestIndex] ?? 10000,
    humidity: hourly.relative_humidity_2m?.[bestIndex] ?? 65,
    temperature: hourly.temperature_2m?.[bestIndex] ?? null,
    windSpeed: hourly.wind_speed_10m?.[bestIndex] ?? null,
  };
}

function visibilityScore(meters) {
  return clamp(((meters - 3000) / 12000) * 100);
}

function cloudSweetSpot(value, ideal, width) {
  return clamp(100 - Math.abs(value - ideal) * (100 / width));
}

function scoreGlow(hour) {
  const middleHigh = (hour.midCloud + hour.highCloud) / 2;
  const texture = cloudSweetSpot(middleHigh, 48, 55);
  const lowPenalty = Math.max(0, hour.lowCloud - 38) * 0.78;
  const rainPenalty = hour.rainChance * 0.72;
  const visibilityBoost = visibilityScore(hour.visibility) * 0.24;
  const clearPenalty = hour.cloud < 12 ? 16 : 0;
  const overcastPenalty = hour.cloud > 86 ? (hour.cloud - 86) * 1.2 : 0;

  return clamp(texture * 0.72 + visibilityBoost + 18 - lowPenalty - rainPenalty - clearPenalty - overcastPenalty);
}

function scoreFireCloud(hour, air) {
  const middleHigh = hour.midCloud * 0.48 + hour.highCloud * 0.52;
  const dramaticCloud = cloudSweetSpot(middleHigh, 64, 48);
  const humidity = cloudSweetSpot(hour.humidity, 66, 42);
  const lowPenalty = Math.max(0, hour.lowCloud - 34) * 0.95;
  const rainPenalty = hour.rainChance * 0.82;
  const overcastPenalty = hour.cloud > 88 ? (hour.cloud - 88) * 1.1 : 0;
  const visibilityBoost = visibilityScore(hour.visibility) * 0.18;
  const aerosolBoost = clamp((air.aerosolOpticalDepth || 0) * 80, 0, 10);
  const airPenalty = clamp((air.pm25 || 0) * 0.28 + (air.dust || 0) * 0.12, 0, 20);

  return clamp(dramaticCloud * 0.64 + humidity * 0.14 + visibilityBoost + aerosolBoost + 16 - lowPenalty - rainPenalty - overcastPenalty - airPenalty);
}

function scoreStars(hour, moonLight, air) {
  const clearSky = 100 - hour.cloud;
  const rainPenalty = hour.rainChance * 0.86;
  const visibility = visibilityScore(hour.visibility);
  const moonPenalty = moonLight * 24;
  const airPenalty = clamp((air.pm25 || 0) * 0.35 + (air.aerosolOpticalDepth || 0) * 18, 0, 22);

  return clamp(clearSky * 0.72 + visibility * 0.28 + 12 - rainPenalty - moonPenalty - airPenalty);
}

function buildReason(type, hour, air = {}) {
  const parts = [];

  if (type === "stars") {
    parts.push(hour.cloud <= 30 ? "云量较低" : hour.cloud <= 60 ? "云量一般" : "云层偏多");
    parts.push(hour.visibility >= 10000 ? "能见度不错" : "能见度一般");
    parts.push((air.pm25 || 0) <= 20 ? "空气通透度尚可" : "颗粒物会影响通透");
  } else if (type === "fire") {
    const upperCloud = Math.round((hour.midCloud + hour.highCloud) / 2);
    parts.push(upperCloud >= 45 && upperCloud <= 78 ? "中高云有戏剧性" : upperCloud < 45 ? "火烧云云量偏少" : "云层可能太厚");
    parts.push(hour.lowCloud <= 36 ? "低云遮挡少" : "低云遮挡偏多");
    parts.push(hour.humidity >= 45 && hour.humidity <= 82 ? "湿度区间较合适" : "湿度不够理想");
  } else {
    const upperCloud = Math.round((hour.midCloud + hour.highCloud) / 2);
    parts.push(upperCloud >= 28 && upperCloud <= 68 ? "中高云适中" : upperCloud < 28 ? "云彩纹理偏少" : "中高云偏厚");
    parts.push(hour.lowCloud <= 42 ? "低云压力小" : "低云偏厚");
  }

  parts.push(hour.rainChance <= 20 ? "降水风险低" : hour.rainChance <= 55 ? "有降水干扰" : "降水风险高");
  return parts.join("，");
}

function moonIllumination(date) {
  const synodicMonth = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNewMoon) / 86400000;
  const normalized = ((days / synodicMonth) % 1 + 1) % 1;
  return (1 - Math.cos(2 * Math.PI * normalized)) / 2;
}

function solarEvent(date, lat, lon, targetAltitudeDeg) {
  const rad = Math.PI / 180;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfYear = Math.floor((day - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const lngHour = lon / 15;

  function calc(isRise) {
    const t = dayOfYear + ((isRise ? 6 : 18) - lngHour) / 24;
    const meanAnomaly = 0.9856 * t - 3.289;
    let trueLong = meanAnomaly + 1.916 * Math.sin(rad * meanAnomaly) + 0.02 * Math.sin(rad * 2 * meanAnomaly) + 282.634;
    trueLong = (trueLong + 360) % 360;

    let rightAscension = Math.atan(0.91764 * Math.tan(rad * trueLong)) / rad;
    rightAscension = (rightAscension + 360) % 360;
    const lQuadrant = Math.floor(trueLong / 90) * 90;
    const raQuadrant = Math.floor(rightAscension / 90) * 90;
    rightAscension = (rightAscension + lQuadrant - raQuadrant) / 15;

    const sinDec = 0.39782 * Math.sin(rad * trueLong);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosHour = (Math.sin(rad * targetAltitudeDeg) - sinDec * Math.sin(rad * lat)) / (cosDec * Math.cos(rad * lat));

    if (cosHour > 1 || cosHour < -1) return null;

    let hourAngle = isRise ? 360 - Math.acos(cosHour) / rad : Math.acos(cosHour) / rad;
    hourAngle /= 15;

    const localMeanTime = hourAngle + rightAscension - 0.06571 * t - 6.622;
    const universalTime = (localMeanTime - lngHour + 24) % 24;
    const result = new Date(day);
    result.setUTCHours(0, 0, 0, 0);
    result.setUTCMinutes(Math.round(universalTime * 60));
    return result;
  }

  return {
    rise: calc(true),
    set: calc(false),
  };
}

function blueHourFallback(date, latitude, longitude, sunrise, sunset) {
  const blue = solarEvent(date, latitude, longitude, -4);
  const deeper = solarEvent(date, latitude, longitude, -6);

  return {
    morningStart: deeper.rise ?? addMinutes(sunrise, -30),
    morningEnd: blue.rise ?? addMinutes(sunrise, -10),
    eveningStart: blue.set ?? addMinutes(sunset, 10),
    eveningEnd: deeper.set ?? addMinutes(sunset, 30),
  };
}

function destinationPoint(latitude, longitude, bearing, distanceKm) {
  const radius = 6371;
  const angularDistance = distanceKm / radius;
  const bearingRad = (bearing * Math.PI) / 180;
  const latRad = (latitude * Math.PI) / 180;
  const lonRad = (longitude * Math.PI) / 180;
  const targetLat = Math.asin(Math.sin(latRad) * Math.cos(angularDistance) + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad));
  const targetLon =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(targetLat)
    );

  return {
    latitude: (targetLat * 180) / Math.PI,
    longitude: ((((targetLon * 180) / Math.PI + 540) % 360) - 180),
  };
}

function mapEmbedUrl(latitude, longitude, zoom = 11) {
  const delta = zoom >= 12 ? 0.035 : 0.08;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].map((value) => value.toFixed(5)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function osmUrl(latitude, longitude, zoom = 11) {
  return `https://www.openstreetmap.org/?mlat=${latitude.toFixed(5)}&mlon=${longitude.toFixed(5)}#map=${zoom}/${latitude.toFixed(5)}/${longitude.toFixed(5)}`;
}

function lightPollutionMapUrl(latitude, longitude) {
  return `https://www.lightpollutionmap.info/#zoom=10.00&lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`;
}

async function requestPosition() {
  if (!("geolocation" in navigator)) {
    throw new Error("当前浏览器不支持定位");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, LOCATION_OPTIONS);
  });
}

function weatherParams(latitude, longitude) {
  return new URLSearchParams({
    latitude,
    longitude,
    timezone: "auto",
    forecast_days: "3",
    current: "temperature_2m,apparent_temperature,weather_code,cloud_cover,precipitation,wind_speed_10m",
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "cloud_cover",
      "cloud_cover_low",
      "cloud_cover_mid",
      "cloud_cover_high",
      "precipitation_probability",
      "visibility",
      "wind_speed_10m",
    ].join(","),
    daily: ["sunrise", "sunset"].join(","),
  });
}

async function fetchWeather(latitude, longitude) {
  const params = weatherParams(latitude.toFixed(5), longitude.toFixed(5));
  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`天气服务返回 ${response.status}`);
  }

  return response.json();
}

async function fetchNearbyWeather(latitude, longitude) {
  const points = NEARBY_POINTS.map(([label, bearing, distance]) => ({
    label,
    distance,
    ...destinationPoint(latitude, longitude, bearing, distance),
  }));
  const params = weatherParams(
    points.map((point) => point.latitude.toFixed(5)).join(","),
    points.map((point) => point.longitude.toFixed(5)).join(",")
  );
  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!response.ok) return [];

  const payload = await response.json();
  return (Array.isArray(payload) ? payload : [payload]).map((weather, index) => ({
    ...points[index],
    weather,
  }));
}

async function fetchAirQuality(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    timezone: "auto",
    forecast_days: "2",
    current: "pm2_5,pm10,us_aqi,aerosol_optical_depth,dust",
    hourly: "pm2_5,us_aqi,aerosol_optical_depth,dust",
  });
  const response = await fetch(`${AIR_QUALITY_URL}?${params.toString()}`);
  if (!response.ok) {
    return { pm25: 0, pm10: 0, usAqi: 0, aerosolOpticalDepth: 0, dust: 0 };
  }
  const data = await response.json();

  return {
    pm25: data.current?.pm2_5 ?? 0,
    pm10: data.current?.pm10 ?? 0,
    usAqi: data.current?.us_aqi ?? 0,
    aerosolOpticalDepth: data.current?.aerosol_optical_depth ?? 0,
    dust: data.current?.dust ?? 0,
  };
}

function buildDay(weather, air, latitude, longitude, dayIndex = 0) {
  const date = parseLocalDate(weather.daily.time[dayIndex]);
  const sunrise = parseWeatherTime(weather.daily.sunrise[dayIndex]);
  const sunset = parseWeatherTime(weather.daily.sunset[dayIndex]);
  const nextSunrise = parseWeatherTime(weather.daily.sunrise[dayIndex + 1] ?? weather.daily.sunrise[dayIndex]);
  const blue = blueHourFallback(date, latitude, longitude, sunrise, sunset);

  const windows = {
    dawn: [addMinutes(sunrise, -42), addMinutes(sunrise, 12)],
    sunset: [addMinutes(sunset, -22), addMinutes(sunset, 46)],
    fire: [addMinutes(sunset, -28), addMinutes(sunset, 30)],
    stars: [addMinutes(sunset, 92), addMinutes(nextSunrise, -92)],
  };
  const hours = {
    dawn: readHourlyAt(weather.hourly, midpoint(...windows.dawn)),
    sunset: readHourlyAt(weather.hourly, midpoint(...windows.sunset)),
    fire: readHourlyAt(weather.hourly, midpoint(...windows.fire)),
    stars: readHourlyAt(weather.hourly, addMinutes(windows.stars[0], 90)),
  };
  const moonLight = moonIllumination(date);
  const scores = {
    dawn: scoreGlow(hours.dawn),
    sunset: scoreGlow(hours.sunset),
    fire: scoreFireCloud(hours.fire, air),
    stars: scoreStars(hours.stars, moonLight, air),
  };

  return {
    date,
    sunrise,
    sunset,
    blue,
    windows,
    hours,
    moonLight,
    scores,
    reasons: {
      dawn: buildReason("dawn", hours.dawn, air),
      sunset: buildReason("sunset", hours.sunset, air),
      fire: buildReason("fire", hours.fire, air),
      stars: buildReason("stars", hours.stars, air),
    },
  };
}

function buildNearbyCandidates(nearby, air, metric) {
  return nearby
    .map((point) => {
      const day = buildDay(point.weather, air, point.latitude, point.longitude, 0);
      return {
        ...point,
        score: day.scores[metric],
        time: formatRange(...day.windows[metric]),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function chooseHeadline(scores) {
  const entries = [
    ["朝霞", scores.dawn],
    ["晚霞", scores.sunset],
    ["火烧云", scores.fire],
    ["星空", scores.stars],
  ].sort((a, b) => b[1] - a[1]);

  const [name, score] = entries[0];
  if (score >= 76) return `今天适合拍${name}`;
  if (score >= 55) return `${name}值得留意`;
  return "今天条件一般";
}

function heroWeatherClass(weather, today) {
  const code = weather.current?.weather_code ?? 0;
  if (today.scores.fire >= 72) return "weather-fire";
  if (today.scores.stars >= 72 && new Date() > today.windows.stars[0]) return "weather-night";
  if (code >= 51) return "weather-rain";
  if (code >= 2 || (weather.current?.cloud_cover ?? 0) > 62) return "weather-cloudy";
  return "weather-clear";
}

function setMeter(element, score) {
  element.style.width = `${clamp(score)}%`;
}

function render(state) {
  const { weather, air, latitude, longitude, today, tomorrow } = state;
  const locationText = locationLabel ? `${locationLabel} · ${latitude.toFixed(2)}, ${longitude.toFixed(2)}` : `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  elements.placeLabel.textContent = locationText;
  elements.summaryTitle.textContent = chooseHeadline(today.scores);
  elements.summaryMeta.textContent = `日出 ${formatTime(today.sunrise)} · 日落 ${formatTime(today.sunset)} · CAMS ${formatNumber(air.pm25, 0)} PM2.5`;

  elements.heroPanel.classList.remove("weather-clear", "weather-cloudy", "weather-rain", "weather-fire", "weather-night");
  elements.heroPanel.classList.add(heroWeatherClass(weather, today));

  elements.dawnScore.textContent = formatPercent(today.scores.dawn);
  elements.sunsetScore.textContent = formatPercent(today.scores.sunset);
  elements.fireScore.textContent = formatPercent(today.scores.fire);
  elements.starsScore.textContent = formatPercent(today.scores.stars);
  setMeter(elements.dawnMeter, today.scores.dawn);
  setMeter(elements.sunsetMeter, today.scores.sunset);
  setMeter(elements.fireMeter, today.scores.fire);
  setMeter(elements.starsMeter, today.scores.stars);

  elements.dawnTime.textContent = formatRange(...today.windows.dawn);
  elements.sunsetTime.textContent = formatRange(...today.windows.sunset);
  elements.fireTime.textContent = formatRange(...today.windows.fire);
  elements.starsTime.textContent = formatRange(...today.windows.stars);
  elements.dawnReason.textContent = today.reasons.dawn;
  elements.sunsetReason.textContent = today.reasons.sunset;
  elements.fireReason.textContent = today.reasons.fire;
  elements.starsReason.textContent = today.reasons.stars;

  elements.timezoneLabel.textContent = weather.timezone_abbreviation || weather.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  elements.morningBlue.textContent = formatRange(today.blue.morningStart, today.blue.morningEnd);
  elements.eveningBlue.textContent = formatRange(today.blue.eveningStart, today.blue.eveningEnd);

  elements.updatedAt.textContent = formatTime(new Date());
  elements.cloudMetric.textContent = formatPercent(weather.current?.cloud_cover);
  elements.highCloudMetric.textContent = formatPercent(today.hours.sunset.highCloud);
  elements.rainMetric.textContent = formatPercent(Math.max(today.hours.dawn.rainChance, today.hours.sunset.rainChance, today.hours.stars.rainChance));
  elements.visibilityMetric.textContent = formatKm(Math.max(today.hours.dawn.visibility, today.hours.sunset.visibility, today.hours.stars.visibility));

  if (!elements.detailSheet.hidden) {
    renderDetail(activeDetail);
  }

  state.tomorrow = tomorrow;
}

function metricHtml(items) {
  return items
    .map(
      (item) => `
        <div>
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");
}

function insightHtml(items) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

function nearbyHtml(items) {
  if (!items.length) {
    return `<div class="nearby-item"><strong>暂无附近候选数据</strong><small>稍后刷新再试</small></div>`;
  }

  return items
    .map(
      (item) => `
        <a class="nearby-item" href="${osmUrl(item.latitude, item.longitude, 12)}" target="_blank" rel="noreferrer">
          <div>
            <strong>${item.label}约 ${item.distance} km</strong>
            <small>${item.time} · ${item.latitude.toFixed(2)}, ${item.longitude.toFixed(2)}</small>
          </div>
          <span>${formatPercent(item.score)}</span>
        </a>
      `
    )
    .join("");
}

function detailConfig(type) {
  const { latitude, longitude, weather, air, today, tomorrow, nearby } = appState;
  const configs = {
    overview: {
      kicker: "今日总览",
      title: chooseHeadline(today.scores),
      score: Math.max(today.scores.dawn, today.scores.sunset, today.scores.fire, today.scores.stars),
      subtitle: `朝霞 ${formatPercent(today.scores.dawn)} · 晚霞 ${formatPercent(today.scores.sunset)} · 火烧云 ${formatPercent(today.scores.fire)} · 星空 ${formatPercent(today.scores.stars)}`,
      metrics: [
        ["温度", `${formatNumber(weather.current?.temperature_2m, 0)}°C`],
        ["体感", `${formatNumber(weather.current?.apparent_temperature, 0)}°C`],
        ["总云量", formatPercent(weather.current?.cloud_cover)],
        ["风速", `${formatNumber(weather.current?.wind_speed_10m, 0)} km/h`],
      ],
      insights: [
        `明天朝霞 ${formatPercent(tomorrow.scores.dawn)}，晚霞 ${formatPercent(tomorrow.scores.sunset)}，火烧云 ${formatPercent(tomorrow.scores.fire)}。`,
        `蓝调时间：清晨 ${formatRange(today.blue.morningStart, today.blue.morningEnd)}，傍晚 ${formatRange(today.blue.eveningStart, today.blue.eveningEnd)}。`,
        "天气模型走 Open-Meteo JSON 接口，空气质量和气溶胶指标来自 CAMS 汇总接口。",
      ],
      metric: "fire",
      nearbyTitle: "附近火烧云候选",
      mapUrl: osmUrl(latitude, longitude, 11),
      embed: mapEmbedUrl(latitude, longitude, 11),
    },
    dawn: {
      kicker: "朝霞详情",
      title: "东方天空窗口",
      score: today.scores.dawn,
      subtitle: `今天 ${formatRange(...today.windows.dawn)} · 明天 ${formatPercent(tomorrow.scores.dawn)}`,
      metrics: [
        ["今日概率", formatPercent(today.scores.dawn)],
        ["明日概率", formatPercent(tomorrow.scores.dawn)],
        ["中云", formatPercent(today.hours.dawn.midCloud)],
        ["低云", formatPercent(today.hours.dawn.lowCloud)],
      ],
      insights: [
        today.reasons.dawn,
        "朝霞主要看日出前后的东方地平线，建议提前 40 分钟到场。",
        `明天窗口约为 ${formatRange(...tomorrow.windows.dawn)}。`,
      ],
      metric: "dawn",
      nearbyTitle: "附近朝霞候选",
      mapUrl: osmUrl(latitude, longitude, 12),
      embed: mapEmbedUrl(latitude, longitude, 12),
    },
    sunset: {
      kicker: "晚霞详情",
      title: "西方天空窗口",
      score: today.scores.sunset,
      subtitle: `今天 ${formatRange(...today.windows.sunset)} · 明天 ${formatPercent(tomorrow.scores.sunset)}`,
      metrics: [
        ["今日概率", formatPercent(today.scores.sunset)],
        ["明日概率", formatPercent(tomorrow.scores.sunset)],
        ["高云", formatPercent(today.hours.sunset.highCloud)],
        ["降水", formatPercent(today.hours.sunset.rainChance)],
      ],
      insights: [
        today.reasons.sunset,
        "晚霞看日落前后的西方和西北/西南天空，低云太厚会明显削弱颜色。",
        `明天窗口约为 ${formatRange(...tomorrow.windows.sunset)}。`,
      ],
      metric: "sunset",
      nearbyTitle: "附近晚霞候选",
      mapUrl: osmUrl(latitude, longitude, 12),
      embed: mapEmbedUrl(latitude, longitude, 12),
    },
    fire: {
      kicker: "火烧云详情",
      title: "高饱和晚霞窗口",
      score: today.scores.fire,
      subtitle: `今天 ${formatRange(...today.windows.fire)} · 明天 ${formatPercent(tomorrow.scores.fire)}`,
      metrics: [
        ["火烧云", formatPercent(today.scores.fire)],
        ["明日概率", formatPercent(tomorrow.scores.fire)],
        ["中高云", formatPercent((today.hours.fire.midCloud + today.hours.fire.highCloud) / 2)],
        ["PM2.5", `${formatNumber(air.pm25, 0)} µg/m³`],
      ],
      insights: [
        today.reasons.fire,
        "火烧云更依赖适量中高云、较少低云遮挡，以及日落附近的通透度。",
        `气溶胶光学厚度 ${formatNumber(air.aerosolOpticalDepth, 2)}，轻微气溶胶可能增强暖色，颗粒物太多会降低通透。`,
      ],
      metric: "fire",
      nearbyTitle: "附近火烧云候选",
      mapUrl: osmUrl(latitude, longitude, 12),
      embed: mapEmbedUrl(latitude, longitude, 12),
    },
    stars: {
      kicker: "星空详情",
      title: "暗夜和通透度",
      score: today.scores.stars,
      subtitle: `今晚 ${formatRange(...today.windows.stars)} · 明晚 ${formatPercent(tomorrow.scores.stars)}`,
      metrics: [
        ["星空概率", formatPercent(today.scores.stars)],
        ["月光", formatPercent(today.moonLight * 100)],
        ["PM2.5", `${formatNumber(air.pm25, 0)} µg/m³`],
        ["AOD", formatNumber(air.aerosolOpticalDepth, 2)],
      ],
      insights: [
        today.reasons.stars,
        "光污染图层目前作为外部地图入口，真实 Bortle/夜光强度后续可接 VIIRS 或 World Atlas 数据。",
        `打开光污染地图后，优先找远离城市核心、海边或山脊且云量低的方向。`,
      ],
      metric: "stars",
      nearbyTitle: "附近星空候选",
      mapUrl: lightPollutionMapUrl(latitude, longitude),
      embed: mapEmbedUrl(latitude, longitude, 10),
    },
  };

  const config = configs[type] || configs.overview;
  config.nearby = buildNearbyCandidates(nearby, air, config.metric);
  return config;
}

function renderDetail(type) {
  if (!appState) return;

  activeDetail = type;
  const config = detailConfig(type);
  elements.sheetKicker.textContent = config.kicker;
  elements.sheetTitle.textContent = config.title;
  elements.sheetScore.textContent = formatPercent(config.score);
  elements.sheetSubtitle.textContent = config.subtitle;
  elements.sheetMapFrame.src = config.embed;
  elements.sheetModel.textContent = type === "stars" || type === "fire" ? "Open-Meteo + CAMS" : "Open-Meteo";
  elements.sheetMetrics.innerHTML = metricHtml(config.metrics.map(([label, value]) => ({ label, value })));
  elements.sheetInsights.innerHTML = insightHtml(config.insights);
  elements.sheetUpdated.textContent = formatTime(new Date());
  elements.nearbyTitle.textContent = config.nearbyTitle;
  elements.externalMapLink.href = config.mapUrl;
  elements.externalMapLink.textContent = type === "stars" ? "光污染图" : "打开地图";
  elements.nearbyList.innerHTML = nearbyHtml(config.nearby);
}

function openDetail(type) {
  if (!appState) return;

  renderDetail(type);
  elements.sheetBackdrop.hidden = false;
  elements.detailSheet.hidden = false;
}

function closeDetail() {
  elements.sheetBackdrop.hidden = true;
  elements.detailSheet.hidden = true;
}

function setLoading(isLoading) {
  document.body.classList.toggle("loading", isLoading);
  elements.refreshButton.disabled = isLoading;
}

async function refresh() {
  setLoading(true);
  elements.statusLine.textContent = "正在定位并获取天气";

  try {
    let latitude;
    let longitude;

    try {
      const position = await requestPosition();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      locationLabel = "当前位置";
    } catch {
      latitude = DEMO_LOCATION.latitude;
      longitude = DEMO_LOCATION.longitude;
      locationLabel = DEMO_LOCATION.label;
      elements.statusLine.textContent = "定位失败，已载入示例位置";
    }

    const [weather, air, nearby] = await Promise.all([
      fetchWeather(latitude, longitude),
      fetchAirQuality(latitude, longitude),
      fetchNearbyWeather(latitude, longitude).catch(() => []),
    ]);
    const today = buildDay(weather, air, latitude, longitude, 0);
    const tomorrow = buildDay(weather, air, latitude, longitude, 1);

    appState = {
      latitude,
      longitude,
      weather,
      air,
      nearby,
      today,
      tomorrow,
    };

    render(appState);
    elements.statusLine.textContent =
      locationLabel === DEMO_LOCATION.label
        ? "示例数据来自 Open-Meteo，CAMS 指标用于通透度参考"
        : "数据来自 Open-Meteo，CAMS 指标用于通透度参考";
  } catch (error) {
    elements.statusLine.textContent = error.message || "获取失败，请稍后重试";
  } finally {
    setLoading(false);
  }
}

elements.refreshButton.addEventListener("click", refresh);
elements.heroPanel.addEventListener("click", () => openDetail("overview"));
document.querySelectorAll("[data-detail]").forEach((button) => {
  button.addEventListener("click", () => openDetail(button.dataset.detail));
});
elements.closeSheet.addEventListener("click", closeDetail);
elements.sheetBackdrop.addEventListener("click", closeDetail);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetail();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

refresh();

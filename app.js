const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
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

const $ = (id) => document.getElementById(id);

const elements = {
  refreshButton: $("refreshButton"),
  placeLabel: $("placeLabel"),
  summaryTitle: $("summaryTitle"),
  summaryMeta: $("summaryMeta"),
  dawnScore: $("dawnScore"),
  sunsetScore: $("sunsetScore"),
  starsScore: $("starsScore"),
  dawnMeter: $("dawnMeter"),
  sunsetMeter: $("sunsetMeter"),
  starsMeter: $("starsMeter"),
  dawnTime: $("dawnTime"),
  sunsetTime: $("sunsetTime"),
  starsTime: $("starsTime"),
  dawnReason: $("dawnReason"),
  sunsetReason: $("sunsetReason"),
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
};

let locationLabel = "";

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

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function midpoint(start, end) {
  return new Date((start.getTime() + end.getTime()) / 2);
}

function readHourlyAt(hourly, date) {
  const target = date.getTime();
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  hourly.time.forEach((iso, index) => {
    const distance = Math.abs(new Date(iso).getTime() - target);
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

function scoreStars(hour, moonIllumination) {
  const clearSky = 100 - hour.cloud;
  const rainPenalty = hour.rainChance * 0.86;
  const visibility = visibilityScore(hour.visibility);
  const moonPenalty = moonIllumination * 24;

  return clamp(clearSky * 0.72 + visibility * 0.28 + 12 - rainPenalty - moonPenalty);
}

function buildReason(type, hour) {
  const parts = [];

  if (type === "stars") {
    parts.push(hour.cloud <= 30 ? "云量较低" : hour.cloud <= 60 ? "云量一般" : "云层偏多");
    parts.push(hour.visibility >= 10000 ? "能见度不错" : "能见度一般");
  } else {
    const upperCloud = Math.round((hour.midCloud + hour.highCloud) / 2);
    parts.push(upperCloud >= 28 && upperCloud <= 68 ? "中高云适中" : upperCloud < 28 ? "云彩纹理偏少" : "中高云偏厚");
    parts.push(hour.lowCloud <= 42 ? "低云压力小" : "低云偏厚");
  }

  parts.push(hour.rainChance <= 20 ? "降水风险低" : hour.rainChance <= 55 ? "有降水干扰" : "降水风险高");
  return parts.join("，");
}

function getTodayIndex(daily) {
  const today = new Date().toISOString().slice(0, 10);
  const index = daily.time.findIndex((value) => value === today);
  return index >= 0 ? index : 0;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

async function requestPosition() {
  if (!("geolocation" in navigator)) {
    throw new Error("当前浏览器不支持定位");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, LOCATION_OPTIONS);
  });
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    timezone: "auto",
    forecast_days: "2",
    current: "temperature_2m,weather_code,cloud_cover,precipitation",
    hourly: [
      "cloud_cover",
      "cloud_cover_low",
      "cloud_cover_mid",
      "cloud_cover_high",
      "precipitation_probability",
      "visibility",
    ].join(","),
    daily: ["sunrise", "sunset"].join(","),
  });

  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`天气服务返回 ${response.status}`);
  }

  return response.json();
}

function chooseHeadline(scores) {
  const entries = [
    ["朝霞", scores.dawn],
    ["晚霞", scores.sunset],
    ["星空", scores.stars],
  ].sort((a, b) => b[1] - a[1]);

  const [name, score] = entries[0];
  if (score >= 76) return `今天适合拍${name}`;
  if (score >= 55) return `${name}值得留意`;
  return "今天条件一般";
}

function render(data, latitude, longitude) {
  const dailyIndex = getTodayIndex(data.daily);
  const today = parseLocalDate(data.daily.time[dailyIndex]);
  const sunrise = new Date(data.daily.sunrise[dailyIndex]);
  const sunset = new Date(data.daily.sunset[dailyIndex]);
  const blue = blueHourFallback(today, latitude, longitude, sunrise, sunset);

  const dawnWindowStart = addMinutes(sunrise, -42);
  const dawnWindowEnd = addMinutes(sunrise, 12);
  const sunsetWindowStart = addMinutes(sunset, -22);
  const sunsetWindowEnd = addMinutes(sunset, 46);
  const nightStart = addMinutes(sunset, 92);
  const nightEnd = addMinutes(new Date(data.daily.sunrise[dailyIndex + 1] ?? sunrise), -92);

  const dawnHour = readHourlyAt(data.hourly, midpoint(dawnWindowStart, dawnWindowEnd));
  const sunsetHour = readHourlyAt(data.hourly, midpoint(sunsetWindowStart, sunsetWindowEnd));
  const starHour = readHourlyAt(data.hourly, addMinutes(nightStart, 90));
  const moonLight = moonIllumination(today);

  const scores = {
    dawn: scoreGlow(dawnHour),
    sunset: scoreGlow(sunsetHour),
    stars: scoreStars(starHour, moonLight),
  };

  elements.placeLabel.textContent = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  if (locationLabel) {
    elements.placeLabel.textContent = `${locationLabel} · ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  }
  elements.summaryTitle.textContent = chooseHeadline(scores);
  elements.summaryMeta.textContent = `日出 ${formatTime(sunrise)} · 日落 ${formatTime(sunset)}`;

  elements.dawnScore.textContent = formatPercent(scores.dawn);
  elements.sunsetScore.textContent = formatPercent(scores.sunset);
  elements.starsScore.textContent = formatPercent(scores.stars);
  elements.dawnMeter.style.width = `${scores.dawn}%`;
  elements.sunsetMeter.style.width = `${scores.sunset}%`;
  elements.starsMeter.style.width = `${scores.stars}%`;

  elements.dawnTime.textContent = formatRange(dawnWindowStart, dawnWindowEnd);
  elements.sunsetTime.textContent = formatRange(sunsetWindowStart, sunsetWindowEnd);
  elements.starsTime.textContent = formatRange(nightStart, nightEnd);
  elements.dawnReason.textContent = buildReason("dawn", dawnHour);
  elements.sunsetReason.textContent = buildReason("sunset", sunsetHour);
  elements.starsReason.textContent = buildReason("stars", starHour);

  elements.timezoneLabel.textContent = data.timezone_abbreviation || data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  elements.morningBlue.textContent = formatRange(blue.morningStart, blue.morningEnd);
  elements.eveningBlue.textContent = formatRange(blue.eveningStart, blue.eveningEnd);

  elements.updatedAt.textContent = formatTime(new Date());
  elements.cloudMetric.textContent = formatPercent(data.current?.cloud_cover);
  elements.highCloudMetric.textContent = formatPercent(dawnHour.highCloud);
  elements.rainMetric.textContent = formatPercent(Math.max(dawnHour.rainChance, sunsetHour.rainChance, starHour.rainChance));
  elements.visibilityMetric.textContent = formatKm(Math.max(dawnHour.visibility, sunsetHour.visibility, starHour.visibility));
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

    const weather = await fetchWeather(latitude, longitude);
    render(weather, latitude, longitude);
    elements.statusLine.textContent =
      locationLabel === DEMO_LOCATION.label ? "示例数据来自 Open-Meteo，概率为本地摄影评分模型" : "数据来自 Open-Meteo，概率为本地摄影评分模型";
  } catch (error) {
    elements.statusLine.textContent = error.message || "获取失败，请稍后重试";
  } finally {
    setLoading(false);
  }
}

elements.refreshButton.addEventListener("click", refresh);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

refresh();

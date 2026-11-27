/* ================================================================== */
/* Textes partagés de l'enquête                                       */
/* Les modifications du professeur passent par un canal MQTT public,  */
/* en message retenu : tous les appareils reçoivent la même version.  */
/* Aucune donnée d'élève n'y transite.                                */
/* ================================================================== */
window.EnqueteTexts = (() => {
  const BROKER = "wss://test.mosquitto.org:8081/mqtt";
  const TOPIC = "enquete-regimes/texts/v1";
  const TIMEOUT = 1500;

  let client = null;
  let connected = false;
  let connectWaiters = [];
  let overrides = {};
  let loaded = false;
  let loadWaiters = [];
  let timer = null;

  function finish(value) {
    if (loaded) return;
    loaded = true;
    overrides = value && typeof value === "object" ? value : {};
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const waiters = loadWaiters;
    loadWaiters = [];
    waiters.forEach((cb) => {
      try {
        cb(overrides);
      } catch (_) {}
    });
  }

  function connect(cb) {
    if (typeof mqtt === "undefined") {
      cb?.(false);
      return;
    }
    if (client) {
      if (connected) {
        cb?.(true);
        return;
      }
      const waiter = cb;
      connectWaiters.push(waiter);
      setTimeout(() => {
        const index = connectWaiters.indexOf(waiter);
        if (index >= 0) {
          connectWaiters.splice(index, 1);
          waiter?.(false);
        }
      }, 5000);
      return;
    }

    client = mqtt.connect(BROKER, {
      clientId: "enquete-" + Math.random().toString(16).slice(2),
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 6000
    });
    client.on("message", (topic, payload) => {
      if (topic !== TOPIC) return;
      try {
        finish(JSON.parse(payload.toString()));
      } catch (_) {}
    });
    client.on("connect", () => {
      connected = true;
      client.subscribe(TOPIC, { qos: 1 });
      connectWaiters.forEach((waiter) => waiter?.(true));
      connectWaiters = [];
      cb?.(true);
    });
    client.on("close", () => {
      connected = false;
    });
    client.on("error", () => {});
  }

  function load(cb) {
    if (loaded) {
      cb?.(overrides);
      return;
    }
    loadWaiters.push(cb);
    if (!timer) timer = setTimeout(() => finish({}), TIMEOUT);
    connect((ok) => {
      if (!ok) finish({});
    });
  }

  function save(next) {
    overrides = next && typeof next === "object" ? next : {};
    connect((ok) => {
      if (!ok) return;
      client.publish(TOPIC, JSON.stringify(overrides), { qos: 1, retain: true });
    });
  }

  return { load, save, get: () => overrides };
})();

import CDP from "chrome-remote-interface";
import { timeframeResolution } from "./timeframes.mjs";

const DEFAULT_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeResolution(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "M") return "1M";
  if (normalized === "W") return "1W";
  if (normalized === "D") return "1D";
  if (normalized === "60") return "1H";
  if (normalized === "120") return "2H";
  if (normalized === "240") return "4H";
  return normalized;
}

function symbolMatches(state, expectedSymbol) {
  const target = String(expectedSymbol || "").trim().toUpperCase();
  if (!target) {
    return true;
  }

  const candidates = [
    state.fullName,
    state.symbol,
    state.titleText
  ].filter(Boolean).map((value) => String(value).trim().toUpperCase());

  if (candidates.includes(target)) {
    return true;
  }

  const stripped = target.includes(":") ? target.split(":").pop() : target;
  return candidates.some((value) => value.includes(stripped));
}

function resolutionMatches(state, expectedResolution) {
  if (!expectedResolution) {
    return true;
  }
  return normalizeResolution(state.resolution) === normalizeResolution(expectedResolution);
}

export class TradingViewDesktop {
  constructor({ port = 9222 } = {}) {
    this.host = "localhost";
    this.port = port;
    this.client = null;
    this.target = null;
  }

  async connect() {
    if (this.client) {
      try {
        await this.client.Runtime.evaluate({ expression: "1", returnByValue: true });
        return this.client;
      } catch {
        await this.close();
      }
    }

    const target = await this.findTarget();
    if (!target) {
      throw new Error(
        `TradingView Desktop with CDP was not found on http://${this.host}:${this.port}. Start TradingView with --remote-debugging-port=${this.port}.`
      );
    }

    this.target = target;
    this.client = await CDP({
      host: this.host,
      port: this.port,
      target: target.id
    });

    await this.client.Runtime.enable();
    await this.client.Page.enable();
    await this.client.DOM.enable();
    await this.client.Input.setIgnoreInputEvents({ ignore: false });
    await this.client.Page.bringToFront();
    return this.client;
  }

  async close() {
    if (!this.client) {
      return;
    }
    try {
      await this.client.close();
    } catch {
      // Ignore cleanup failures.
    } finally {
      this.client = null;
      this.target = null;
    }
  }

  async findTarget() {
    let response;
    try {
      response = await fetch(`http://${this.host}:${this.port}/json/list`);
    } catch (error) {
      throw new Error(
        `Unable to reach TradingView CDP at http://${this.host}:${this.port}. Start TradingView Desktop with --remote-debugging-port=${this.port}.`
      );
    }

    if (!response.ok) {
      throw new Error(
        `TradingView CDP target listing returned ${response.status}. Verify that TradingView is running with --remote-debugging-port=${this.port}.`
      );
    }

    const targets = await response.json();
    return targets.find((target) => target.type === "page" && /tradingview\.com\/chart/i.test(target.url))
      || targets.find((target) => target.type === "page" && /tradingview/i.test(target.url))
      || null;
  }

  async evaluate(expression, { awaitPromise = false } = {}) {
    const client = await this.connect();
    const result = await client.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise
    });

    if (result.exceptionDetails) {
      const message = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || "Unknown TradingView evaluation error";
      throw new Error(message);
    }

    return result.result?.value;
  }

  async getState() {
    return this.evaluate(`
      (function() {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        var ext = {};
        try { ext = chart.symbolExt() || {}; } catch (error) {}
        var titleEl = document.querySelector('[data-name="legend-source-title"]')
          || document.querySelector('[class*="title"] [class*="apply-common-tooltip"]');
        return {
          symbol: chart.symbol(),
          fullName: ext.full_name || ext.fullName || ext.symbol || chart.symbol(),
          resolution: chart.resolution(),
          studyCount: chart.getAllStudies().length,
          titleText: titleEl ? titleEl.textContent.trim() : "",
          url: window.location.href
        };
      })()
    `);
  }

  async switchLayout(layoutName) {
    if (!layoutName) {
      return null;
    }

    const result = await this.evaluate(`
      new Promise(function(resolve) {
        try {
          var target = ${JSON.stringify(layoutName)};
          window.TradingViewApi.getSavedCharts(function(charts) {
            if (!charts || !Array.isArray(charts)) {
              resolve({ success: false, error: "getSavedCharts returned no data" });
              return;
            }

            var match = null;
            for (var i = 0; i < charts.length; i++) {
              var name = charts[i].name || charts[i].title || "";
              if (name === target || name.toLowerCase() === target.toLowerCase()) {
                match = charts[i];
                break;
              }
            }

            if (!match) {
              for (var j = 0; j < charts.length; j++) {
                var partialName = (charts[j].name || charts[j].title || "").toLowerCase();
                if (partialName.indexOf(target.toLowerCase()) !== -1) {
                  match = charts[j];
                  break;
                }
              }
            }

            if (!match) {
              resolve({ success: false, error: 'Layout "' + target + '" not found.' });
              return;
            }

            window.TradingViewApi.loadChartFromServer(match.id || match.chartId);
            resolve({
              success: true,
              layoutId: match.id || match.chartId,
              layoutName: match.name || match.title || target
            });
          });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      })
    `, { awaitPromise: true });

    if (!result?.success) {
      throw new Error(result?.error || `Failed to switch to layout "${layoutName}".`);
    }

    await sleep(750);
    await this.evaluate(`
      (function() {
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var text = buttons[i].textContent.trim();
          if (/open anyway|don't save|discard/i.test(text)) {
            buttons[i].click();
            return true;
          }
        }
        return false;
      })()
    `);

    await sleep(1500);
    return result;
  }

  async waitForChartReady({ expectedSymbol = null, expectedResolution = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const state = await this.getState();
      if (symbolMatches(state, expectedSymbol) && resolutionMatches(state, expectedResolution)) {
        return state;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    const state = await this.getState();
    throw new Error(
      `TradingView did not reach the expected chart state in time. Expected symbol=${expectedSymbol || "<unchanged>"} resolution=${expectedResolution || "<unchanged>"}, got symbol=${state.fullName || state.symbol} resolution=${state.resolution}.`
    );
  }

  async setSymbol(expectedSymbol) {
    await this.evaluate(`
      (function() {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        return new Promise(function(resolve) {
          chart.setSymbol(${JSON.stringify(expectedSymbol)}, {});
          setTimeout(resolve, 500);
        });
      })()
    `, { awaitPromise: true });

    return this.waitForChartReady({ expectedSymbol });
  }

  async setTimeframe(timeframe) {
    const resolution = timeframeResolution(timeframe);
    await this.evaluate(`
      (function() {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        chart.setResolution(${JSON.stringify(resolution)}, {});
      })()
    `);

    return this.waitForChartReady({ expectedResolution: resolution });
  }

  async focusChart() {
    const client = await this.connect();
    await client.Page.bringToFront();

    const center = await this.evaluate(`
      (function() {
        var element = document.querySelector('[data-name="pane-canvas"]')
          || document.querySelector('[class*="chart-container"]')
          || document.querySelector('canvas');
        if (!element) {
          return null;
        }
        var rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2)
        };
      })()
    `);

    if (!center) {
      throw new Error("Unable to locate the TradingView chart canvas.");
    }

    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: center.x, y: center.y });
    await client.Input.dispatchMouseEvent({ type: "mousePressed", x: center.x, y: center.y, button: "left", clickCount: 1 });
    await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: center.x, y: center.y, button: "left", clickCount: 1 });
    await sleep(150);
  }

  async pressShortcut(key, modifiers) {
    const client = await this.connect();
    let modifierMask = 0;
    if (modifiers.includes("alt")) modifierMask |= 1;
    if (modifiers.includes("ctrl")) modifierMask |= 2;
    if (modifiers.includes("meta")) modifierMask |= 4;
    if (modifiers.includes("shift")) modifierMask |= 8;

    const upperKey = key.length === 1 ? key.toUpperCase() : key;
    const code = key.length === 1 ? `Key${upperKey}` : upperKey;
    const windowsVirtualKeyCode = key.length === 1 ? upperKey.charCodeAt(0) : 0;

    await client.Input.dispatchKeyEvent({
      type: "keyDown",
      key,
      code,
      modifiers: modifierMask,
      windowsVirtualKeyCode
    });
    await client.Input.dispatchKeyEvent({
      type: "keyUp",
      key,
      code,
      modifiers: modifierMask,
      windowsVirtualKeyCode
    });
  }
}

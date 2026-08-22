const net = require("net");
const http = require("http");
const crypto = require("crypto");
const vscode = require("vscode");

function tcpRpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: "127.0.0.1", port: Number(process.env.AJ_LENS_PORT || 8765) }, () => {
      sock.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n");
    });
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (c) => {
      buf += c;
      if (buf.includes("\n")) {
        try {
          resolve(JSON.parse(buf.trim()));
        } catch (e) {
          reject(e);
        }
        sock.end();
      }
    });
    sock.on("error", reject);
  });
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("aljwharah.openLens", async () => {
      vscode.window.showInformationMessage("ALJWHARAH Lens is a thin viewer. Start the daemon with: aj lens");
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("aljwharah.toggleWatch", async () => {
      vscode.window.showInformationMessage("Mission watch stays inside ajd. This client is read-only.");
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("aljwharah.missions", async () => {
      const res = await tcpRpc("missions.list");
      const lines = (res.result || []).map((m) => `${m.state}  ${m.title}  ${m.missionId}`).join("\n") || "no missions";
      const doc = await vscode.workspace.openTextDocument({ content: lines, language: "plaintext" });
      await vscode.window.showTextDocument(doc);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("aljwharah.diff", async () => {
      const res = await tcpRpc("jail.status");
      vscode.window.showInformationMessage(`Jail: ${res.result?.overlay || "unknown"} (read-only)`);
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate, tcpRpc };


/**
 * GOOGLE APPS SCRIPT BACKEND V20 - TEAM3T (WOODVISION)
 * HỖ TRỢ 9 KẾT QUẢ + HISTORY + SKU SEARCH
 */

function doPost(e) {
  var action = "";
  try {
    var data = JSON.parse(e.postData.contents);
    action = data.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "register") {
      var userSheet = getOrCreateSheet(ss, "Users", ["Username", "Password", "Role", "Status", "Created"]);
      var users = userSheet.getDataRange().getValues();
      for(var i=1; i<users.length; i++) {
        if(users[i][0] == data.username) return response({ status: "error", message: "User exists" });
      }
      userSheet.appendRow([data.username, data.password, "user", "pending", new Date()]);
      return response({ status: "success", message: "Success! Wait for approval." });
    }

    if (action === "login") {
      var userSheet = getOrCreateSheet(ss, "Users");
      var users = userSheet.getDataRange().getValues();
      for (var i = 1; i < users.length; i++) {
        if (users[i][0] == data.username && users[i][1] == data.password) {
          if (users[i][2] !== "admin" && users[i][3] !== "approved") {
            return response({ status: "pending", message: "Pending approval." });
          }
          var apiKey = getApiKey(ss);
          return response({ status: "success", role: users[i][2], apiKey: apiKey });
        }
      }
      return response({ status: "error", message: "Wrong credentials" });
    }

    if (action === "saveResult") {
      var logHeaders = ["Time", "User", "SKU", "Etsy Title", "Etsy Description", "Tags", "Materials", "Original", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"];
      var logSheet = getOrCreateSheet(ss, "WoodVisionLogs", logHeaders);
      var folder = getOrCreateFolder("WoodVision_Assets");
      
      function saveImg(base64, name) {
        if (!base64 || !base64.includes(",")) return "N/A";
        var bytes = Utilities.base64Decode(base64.split(",")[1]);
        var file = folder.createFile(Utilities.newBlob(bytes, "image/png", name + "_" + Date.now() + ".png"));
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return "https://drive.google.com/uc?export=download&id=" + file.getId();
      }

      var row = [
        new Date().toLocaleString(), 
        data.username,
        data.sku || "N/A",
        data.title || "N/A",
        data.etsyDescription || "N/A",
        data.tags || "N/A",
        data.materials || "N/A",
        saveImg(data.originalImage, "Original")
      ];
      
      var results = data.results || [];
      for (var i = 0; i < 9; i++) {
        row.push(results[i] ? saveImg(results[i].url, "Design_" + (i+1)) : "N/A");
      }
      
      logSheet.appendRow(row);
      return response({ status: "success", rowIndex: logSheet.getLastRow() });
    }

    if (action === "updateSku") {
      var logSheet = getOrCreateSheet(ss, "WoodVisionLogs");
      var rowIndex = parseInt(data.rowIndex);
      if (rowIndex && rowIndex > 1) {
        logSheet.getRange(rowIndex, 3).setValue(data.sku);
        return response({ status: "success", message: "SKU Updated" });
      }
      return response({ status: "error", message: "Invalid row" });
    }

    if (action === "getHistory") {
      var logSheet = getOrCreateSheet(ss, "WoodVisionLogs");
      var values = logSheet.getDataRange().getValues();
      var history = [];
      
      function toStableLink(link) {
        if (!link || link === "N/A" || typeof link !== 'string') return "";
        // Extracting ID strictly
        var match = link.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) return "https://lh3.googleusercontent.com/d/" + match[1];
        return link;
      }

      for (var i = values.length - 1; i >= 1; i--) {
        if (data.username === "admin" || values[i][1] === data.username) {
          var results = [];
          for (var col = 8; col <= 16; col++) {
            var val = values[i][col];
            if (val && val !== "N/A") results.push(toStableLink(val));
          }
          history.push({
            rowIndex: i + 1,
            time: values[i][0], username: values[i][1], sku: values[i][2],
            etsyTitle: values[i][3], etsyDescription: values[i][4],
            tags: values[i][5], materials: values[i][6],
            originalImage: toStableLink(values[i][7]), 
            results: results
          });
        }
      }
      return response({ status: "success", history: history });
    }

    if (action === "getUsers") {
      var userSheet = getOrCreateSheet(ss, "Users");
      var users = userSheet.getDataRange().getValues();
      var userList = [];
      for (var i = 1; i < users.length; i++) {
        userList.push({ username: users[i][0], role: users[i][2], status: users[i][3] });
      }
      return response({ status: "success", users: userList });
    }

    if (action === "setApiKey") {
      var settingsSheet = getOrCreateSheet(ss, "Settings", ["KeyName", "Value"]);
      settingsSheet.clear();
      settingsSheet.appendRow(["KeyName", "Value"]);
      var keys = (data.apiKey || "").split(/[\n,\r\s]+/).filter(Boolean);
      keys.forEach(function(key) { settingsSheet.appendRow(["GEMINI_API_KEY", key.trim()]); });
      return response({ status: "success", count: keys.length });
    }

  } catch (err) { return response({ status: "error", message: err.toString() }); }
}

function getApiKey(ss) {
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) return "";
  var data = sheet.getDataRange().getValues();
  var allKeys = [];
  for (var i = 1; i < data.length; i++) {
    var keys = data[i][1].toString().split(/[\n,]+/).map(function(k) { return k.trim(); }).filter(Boolean);
    allKeys = allKeys.concat(keys);
  }
  return allKeys.length ? allKeys[Math.floor(Math.random() * allKeys.length)] : "";
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); if (headers) sheet.appendRow(headers); }
  return sheet;
}

function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

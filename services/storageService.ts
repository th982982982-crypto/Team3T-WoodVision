
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby3BZpurdcdy6ZnAalP4BVczv-buAbsKkn8zbOdrHjLQm5Uwsy0eUDNccpydJ4nGzGz-A/exec";

async function apiCall(data: any) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(data),
  });
  
  if (!response.ok) throw new Error("Network response was not ok");
  return await response.json();
}

export const loginUser = (username: string, password: string) => 
  apiCall({ action: "login", username, password });

export const registerUser = (username: string, password: string) => 
  apiCall({ action: "register", username, password });

export const updateAdminKey = (apiKey: string) => 
  apiCall({ action: "setApiKey", apiKey });

export const fetchUsers = () => 
  apiCall({ action: "getUsers" });

export const approveUser = (targetUsername: string) => 
  apiCall({ action: "approveUser", targetUsername });

export const fetchHistory = (username: string) =>
  apiCall({ action: "getHistory", username });

export const updateSkuManually = (rowIndex: number, sku: string) =>
  apiCall({ action: "updateSku", rowIndex, sku });

export const logToSheet = (
  username: string, 
  originalImage: string, 
  description: string, 
  results: any[], 
  sku: string, 
  title: string, 
  etsyDescription: string, 
  tags: string, 
  materials: string
) => 
  apiCall({ 
    action: "saveResult", 
    username, 
    originalImage, 
    description, 
    results, 
    sku, 
    title, 
    etsyDescription, 
    tags, 
    materials 
  });

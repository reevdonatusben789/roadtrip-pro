import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAFlU1UPopFF5TUbJrbpf75pUiHWUdSi1g",
  authDomain: "road-trip-81e23.firebaseapp.com",
  projectId: "road-trip-81e23",
  storageBucket: "road-trip-81e23.appspot.com",
  messagingSenderId: "197527602150",
  appId: "1:197527602150:web:8b5fed66fb32cf4086cc27"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
const authReady = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    currentUser = user;
    unsubscribe();
    resolve(user);
  });
});

async function saveToFirestore(collectionName, data) {
  await authReady;
  if (!currentUser) throw new Error("You must be logged in before saving to Firebase.");
  await addDoc(collection(db, collectionName), {
    ...data,
    uid: currentUser.uid,
    createdAt: serverTimestamp()
  });
}

function showFirebaseError(error) {
  const message = error?.code === "permission-denied"
    ? "Firebase denied this write. Publish Firestore rules for signed-in users."
    : error?.message || "Firebase could not save this data.";
  alert(message);
}

const STORAGE = {
  budget: "roadTripProBudget",
  group: "roadTripProGroupTrip",
  journal: "roadTripProJournal",
  contacts: "roadTripProEmergencyContacts"
};
const expenseTypes = ["Fuel", "Tolls", "Food", "Hotel / Stay", "Activities", "Parking", "Other"];
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const route = (() => { try { return JSON.parse(sessionStorage.getItem("currentTrip") || "null") || {}; } catch { return {}; } })();
const escapeHtml = (value) => String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

function getBudget() {
  const values = {};
  document.querySelectorAll("[data-expense]").forEach((input) => { values[input.dataset.expense] = Number(input.value || 0); });
  values.travelers = Math.max(1, Number(document.getElementById("travelerCount").value || 1));
  return values;
}

function renderBudget() {
  const budget = getBudget();
  const total = expenseTypes.reduce((sum, name) => sum + budget[name.toLowerCase().replace(/[^a-z]/g, "")], 0);
  document.getElementById("budgetTotal").textContent = money(total);
  document.getElementById("budgetPerPerson").textContent = `${money(total / budget.travelers)} per person · ${budget.travelers} traveler${budget.travelers === 1 ? "" : "s"}`;
}

async function persistBudget() {
  const budget = getBudget();
  budget.total = expenseTypes.reduce((sum, name) => sum + budget[name.toLowerCase().replace(/[^a-z]/g, "")], 0);
  save(STORAGE.budget, budget);
  try { await saveToFirestore("tripExpenses", { ...budget, tripStart: route.start || "", tripDestination: route.end || "" }); }
  catch (error) { showFirebaseError(error); }
}

function setupBudget() {
  const fields = document.getElementById("expenseFields");
  const saved = read(STORAGE.budget, {});
  fields.innerHTML = expenseTypes.map((name) => {
    const key = name.toLowerCase().replace(/[^a-z]/g, "");
    const value = name === "Fuel" && saved[key] == null ? Number(route.fuelCost || 0) : Number(saved[key] || 0);
    return `<div class="field-group"><label>${name}</label><input data-expense="${key}" type="number" min="0" step="0.01" value="${value}"></div>`;
  }).join("");
  document.getElementById("travelerCount").value = saved.travelers || 1;
  renderBudget();
  document.getElementById("budgetForm").addEventListener("submit", async (event) => { event.preventDefault(); await persistBudget(); renderBudget(); });
  fields.addEventListener("input", renderBudget);
  document.getElementById("travelerCount").addEventListener("input", renderBudget);
}

function getParticipants() { return [...document.querySelectorAll("[data-participant]")].map((input) => input.value.trim()).filter(Boolean); }
function getGroup() { return { name: document.getElementById("groupName").value.trim(), start: document.getElementById("groupStart").value.trim(), destination: document.getElementById("groupDestination").value.trim(), date: document.getElementById("groupDate").value, participants: getParticipants(), expenses: read(STORAGE.group, { expenses: [] }).expenses || [] }; }
function renderGroupSummary(group) { const total = (group.expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0) || Number(read(STORAGE.budget, {}).total || 0); const people = group.participants?.length ? group.participants : ["Add participants"]; document.getElementById("groupSummaryName").textContent = group.name || "Your group trip"; document.getElementById("groupSummaryRoute").textContent = group.start && group.destination ? `${group.start} → ${group.destination}` : "Add trip details"; document.getElementById("groupTotal").textContent = money(total); document.getElementById("groupShares").innerHTML = people.map((person) => `<div class="share-row"><span>${escapeHtml(person)}</span><strong>${money(total / Math.max(1, people.length))}</strong></div>`).join(""); }
function renderParticipants(names) { document.getElementById("participantFields").innerHTML = names.map((name, index) => `<div class="participant-field"><input data-participant type="text" placeholder="Participant ${index + 1}" value="${escapeHtml(name)}"><button type="button" class="icon-button remove-participant">×</button></div>`).join(""); document.querySelectorAll(".remove-participant").forEach((button) => button.addEventListener("click", () => { const names = getParticipants(); names.splice([...document.querySelectorAll(".remove-participant")].indexOf(button), 1); renderParticipants(names); })); }

function setupGroup() {
  const saved = read(STORAGE.group, { participants: ["Alex", "Rahul", "Arjun", "Reev"], expenses: [] });
  document.getElementById("groupName").value = saved.name || "";
  document.getElementById("groupStart").value = saved.start || route.start || "";
  document.getElementById("groupDestination").value = saved.destination || route.end || "";
  document.getElementById("groupDate").value = saved.date || "";
  renderParticipants(saved.participants);
  renderGroupSummary(saved);
  document.getElementById("addParticipant").addEventListener("click", () => { const names = getParticipants(); names.push(""); renderParticipants(names); });
  document.getElementById("groupForm").addEventListener("submit", async (event) => { event.preventDefault(); const group = getGroup(); save(STORAGE.group, group); try { await saveToFirestore("groupTrips", group); } catch (error) { showFirebaseError(error); } renderGroupSummary(group); });
  document.getElementById("addGroupExpense").addEventListener("click", async () => { const group = getGroup(); const label = prompt("Expense name", "Shared expense"); if (!label) return; const amount = Number(prompt("Amount in rupees", "0")); if (!Number.isFinite(amount) || amount < 0) return; group.expenses.push({ label, amount }); save(STORAGE.group, group); try { await saveToFirestore("groupTrips", group); } catch (error) { showFirebaseError(error); } renderGroupSummary(group); });
}

async function saveJournal(event) {
  event.preventDefault();
  const existing = read(STORAGE.journal, []);
  const id = document.getElementById("journalId").value || Date.now().toString();
  const entry = { id, title: document.getElementById("journalTitle").value.trim(), start: document.getElementById("journalStart").value.trim(), destination: document.getElementById("journalDestination").value.trim(), date: document.getElementById("journalDate").value, distance: document.getElementById("journalDistance").value, duration: document.getElementById("journalDuration").value.trim(), places: document.getElementById("journalPlaces").value.split(",").map((place) => place.trim()).filter(Boolean), notes: document.getElementById("journalNotes").value.trim() };
  save(STORAGE.journal, [entry, ...existing.filter((item) => item.id !== id)]);
  try { await saveToFirestore("journalEntries", entry); } catch (error) { showFirebaseError(error); }
  document.getElementById("journalForm").reset();
  document.getElementById("journalId").value = "";
  renderJournal();
}
function renderJournal() { const feed = document.getElementById("journalFeed"); const entries = read(STORAGE.journal, []); feed.innerHTML = entries.length ? entries.map((entry) => `<article class="journal-card"><div class="journal-card-body"><p class="eyebrow">${escapeHtml(entry.date || "Saved trip")}</p><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.start || "Start")} → ${escapeHtml(entry.destination)}</p><p>${escapeHtml(entry.notes || "No notes added yet.")}</p></div></article>`).join("") : ""; }

function setupContacts() { renderContacts(); document.getElementById("addContact").addEventListener("click", () => { document.getElementById("contactForm").hidden = false; }); document.getElementById("contactForm").addEventListener("submit", async (event) => { event.preventDefault(); const contact = { name: document.getElementById("contactName").value.trim(), relationship: document.getElementById("contactRelationship").value.trim(), phone: document.getElementById("contactPhone").value.trim() }; const contacts = read(STORAGE.contacts, []); contacts.push(contact); save(STORAGE.contacts, contacts); try { await saveToFirestore("emergencyContacts", contact); } catch (error) { showFirebaseError(error); } event.target.reset(); event.target.hidden = true; renderContacts(); }); }
function renderContacts() { const contacts = read(STORAGE.contacts, []); document.getElementById("contactList").innerHTML = contacts.map((contact) => `<div class="contact-row"><strong>${escapeHtml(contact.name)}</strong><span>${escapeHtml(contact.relationship)}</span><a href="tel:${escapeHtml(contact.phone)}">Call</a></div>`).join(""); }

document.addEventListener("DOMContentLoaded", () => { setupBudget(); setupGroup(); document.getElementById("journalForm").addEventListener("submit", saveJournal); setupContacts(); });

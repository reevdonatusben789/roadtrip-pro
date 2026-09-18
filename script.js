import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAFlU1UPopFF5TUbJrbpf75pUiHWUdSi1g",
  authDomain: "road-trip-81e23.firebaseapp.com",
  projectId: "road-trip-81e23",
  storageBucket: "road-trip-81e23.appspot.com",
  messagingSenderId: "197527602150",
  appId: "1:197527602150:web:8b5fed66fb32cf4086cc27",
  measurementId: "G-E3NGKNHJKQ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const FUEL_PRICES = {
  petrol: 103.5,
  diesel: 90.8
};
const EV_COST_PER_KM = 1.35;
let chargingStationMarkers = [];
let startLocationData = { name: "", lat: null, lng: null }; // Store starting point coordinates
let endLocationData = { name: "", lat: null, lng: null }; // Store destination coordinates

// Update topbar based on auth state
function updateAuthUI() {
  const userSection = document.getElementById("userSection");
  const loginLink = document.getElementById("loginLink");
  const userName = document.getElementById("userName");
  const logoutBtn = document.getElementById("logoutBtn");
  
  if (!userSection || !loginLink || !userName) return;
  
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is logged in
      userSection.style.display = "flex";
      loginLink.style.display = "none";
      // Display user's display name or email
      userName.textContent = user.displayName || user.email;
      
      // Add logout functionality
      if (logoutBtn) {
        logoutBtn.onclick = () => {
          signOut(auth).then(() => {
            alert("Logged out successfully!");
            window.location.href = "home.html";
          }).catch(error => {
            alert("Error logging out: " + error.message);
          });
        };
      }
    } else {
      // User is not logged in
      userSection.style.display = "none";
      loginLink.style.display = "inline-block";
    }
  });
}

// Call updateAuthUI on page load
window.addEventListener('DOMContentLoaded', updateAuthUI);

function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 6,
    center: { lat: 20.5937, lng: 78.9629 } // India center
  });

  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);
  const placesService = new google.maps.places.PlacesService(map);
  setupLocationAutocomplete();
  setupCurrentLocationButton();
  setupFuelSelector();

  // Load trips once user is logged in
  onAuthStateChanged(auth, (user) => {
    if (user) {
      displayTrips(user.uid);
    } else if (document.getElementById("tripList")) {
      document.getElementById("tripList").innerHTML = "<li>Please log in to see your trips.</li>";
    }
  });

  // Handle form submission
  document.getElementById("tripForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;
    const fuelType = document.getElementById("fuelType").value;
    const mileage = parseFloat(document.getElementById("mileage").value);
    const fuelPrice = FUEL_PRICES[fuelType] || 0;

    if (!start || !end || (fuelType !== "ev" && !mileage)) {
      alert("Please fill in all fields.");
      return;
    }

    // Use coordinates if available, otherwise use text address
    const originLocation = (startLocationData.lat && startLocationData.lng) 
      ? { lat: startLocationData.lat, lng: startLocationData.lng }
      : start;
    
    const destinationLocation = (endLocationData.lat && endLocationData.lng)
      ? { lat: endLocationData.lat, lng: endLocationData.lng }
      : end;

    directionsService.route(
      {
        origin: originLocation,
        destination: destinationLocation,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      async (response, status) => {
        if (status === "OK") {
          directionsRenderer.setDirections(response);

          const distance = response.routes[0].legs[0].distance.value / 1000; // km
          const duration = response.routes[0].legs[0].duration.text;
          const fuelCost = fuelType === "ev" ? distance * EV_COST_PER_KM : (distance / mileage) * fuelPrice;

          // Get coordinates from response
          const startLocation = response.routes[0].legs[0].start_location;
          const endLocation = response.routes[0].legs[0].end_location;
          const startCoords = { lat: startLocation.lat(), lng: startLocation.lng() };
          const endCoords = { lat: endLocation.lat(), lng: endLocation.lng() };

          if (fuelType === "ev") {
            await findChargingStationsAlongRoute(placesService, response.routes[0], map);
          } else {
            clearChargingStationMarkers();
          }

          // Store trip data for live trip
          const tripData = {
            start,
            end,
            startCoords,
            endCoords,
            distance: distance.toFixed(2),
            duration,
            durationValue: response.routes[0].legs[0].duration.value,
            fuelCost: fuelCost.toFixed(2),
            fuelType,
            mileage,
            fuelPrice,
            route: response.routes[0]
          };
          sessionStorage.setItem('currentTrip', JSON.stringify(tripData));

          document.getElementById("result").innerHTML = `
            <p><strong>Distance:</strong> ${distance.toFixed(2)} km</p>
            <p><strong>Duration:</strong> ${duration}</p>
            <p><strong>Estimated ${fuelType === "ev" ? "EV charging" : "Fuel"} Cost:</strong> ₹${fuelCost.toFixed(2)}</p>
            <a class="secondary result-feature-link" href="features.html#budget">Open trip budget →</a>
            <button class="primary" style="margin-top: 16px; width: 100%; cursor: pointer;" onclick="window.location.href='live-trip.html'">
              <span>Start Trip</span><b>→</b>
            </button>
          `;

          loadRouteRecommendations(placesService, start, end);

          // Save trip to Firestore
          const user = auth.currentUser;
          if (user) {
            try {
              await addDoc(collection(db, "trips"), {
                uid: user.uid,
                start,
                end,
                distance: distance.toFixed(2),
                duration,
                fuelCost: fuelCost.toFixed(2),
                fuelType,
                fuelPrice: fuelType === "ev" ? "-" : fuelPrice.toFixed(2),
                date: new Date().toLocaleString()
              });
              console.log("Trip saved successfully!");
              displayTrips(user.uid);
            } catch (error) {
              console.error("Error saving trip:", error);
            }
          } else {
            alert("Please log in to save trips.");
          }
        } else {
          alert("Directions request failed due to " + status);
        }
      }
    );
  });
}

function setupFuelSelector() {
  const fuelType = document.getElementById("fuelType");
  const fuelPrice = document.getElementById("fuelPrice");
  const fuelPriceField = document.getElementById("fuelPriceField");
  const mileage = document.getElementById("mileage");
  const mileageField = document.getElementById("mileageField");
  const evDetails = document.getElementById("evDetails");
  if (!fuelType || !fuelPrice || !fuelPriceField || !mileage || !mileageField || !evDetails) return;

  const updateFuelFields = () => {
    const isEv = fuelType.value === "ev";
    fuelPrice.value = isEv ? "" : FUEL_PRICES[fuelType.value].toFixed(2);
    fuelPriceField.hidden = isEv;
    mileageField.hidden = isEv;
    mileage.disabled = isEv;
    mileage.required = !isEv;
    evDetails.hidden = !isEv;
    if (!isEv) clearChargingStationMarkers();
  };

  fuelType.addEventListener("change", updateFuelFields);
  updateFuelFields();
}

function clearChargingStationMarkers() {
  chargingStationMarkers.forEach((marker) => marker.setMap(null));
  chargingStationMarkers = [];
}

function updateEvDetails(message, summary = "") {
  const status = document.getElementById("evStatus");
  const evSummary = document.getElementById("evSummary");
  if (status) status.textContent = message;
  if (evSummary) evSummary.textContent = summary;
}

function getRouteSamplePoints(route, sampleCount = 5) {
  const path = route?.overview_path || [];
  if (!path.length) return [];
  const points = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const pointIndex = Math.min(path.length - 1, Math.round(index * (path.length - 1) / (sampleCount - 1)));
    points.push(path[pointIndex]);
  }
  return points;
}

async function findChargingStationsAlongRoute(placesService, route, mapInstance) {
  clearChargingStationMarkers();
  const evDetails = document.getElementById("evDetails");
  if (evDetails) evDetails.hidden = false;
  updateEvDetails("Searching for charging stations across your route...", "");

  const stations = [];
  const seen = new Set();
  for (const point of getRouteSamplePoints(route)) {
    const results = await new Promise((resolve) => {
      placesService.nearbySearch({ location: point, radius: 12000, type: "charging_station" }, (places, status) => {
        resolve(status === google.maps.places.PlacesServiceStatus.OK ? places : []);
      });
    });

    results.forEach((station) => {
      const key = station.place_id || `${station.name}-${station.vicinity}`;
      if (!seen.has(key)) {
        seen.add(key);
        stations.push(station);
      }
    });
  }

  stations.slice(0, 12).forEach((station) => {
    if (!station.geometry?.location) return;
    const marker = new google.maps.Marker({
      position: station.geometry.location,
      map: mapInstance,
      title: station.name,
      label: "⚡"
    });
    chargingStationMarkers.push(marker);
  });

  const distance = route.legs?.[0]?.distance?.value ? route.legs[0].distance.value / 1000 : 0;
  const stationText = stations.length ? `${Math.min(stations.length, 12)} charging station${stations.length === 1 ? "" : "s"} shown on the map.` : "No charging stations were found along the sampled route.";
  updateEvDetails(stationText, `Approximate EV journey price: ₹${(distance * EV_COST_PER_KM).toFixed(2)} (₹${EV_COST_PER_KM.toFixed(2)} per km).`);
}

function loadRouteRecommendations(placesService, start, destination) {
  const section = document.getElementById("routeRecommendations");
  const statusText = document.getElementById("recommendationStatus");
  const grid = document.getElementById("recommendationGrid");
  if (!section || !statusText || !grid) return;

  section.hidden = false;
  statusText.textContent = `Finding popular places near ${destination}...`;
  grid.innerHTML = '<p class="recommendation-empty">Loading recommendations...</p>';

  placesService.textSearch(
    {
      query: `tourist attractions near ${destination}`,
      region: "in"
    },
    (places, status) => {
      if (status !== "OK" || !places?.length) {
        statusText.textContent = `No recommendations found near ${destination}.`;
        grid.innerHTML = '<p class="recommendation-empty">Try a nearby city or a more specific destination.</p>';
        return;
      }

      const recommendations = places.slice(0, 4);
      statusText.textContent = `Popular stops near ${destination}, from ${start}.`;
      grid.innerHTML = "";

      recommendations.forEach((place) => {
        const card = document.createElement("article");
        card.className = "recommendation-card";

        const image = document.createElement("div");
        image.className = "recommendation-image";
        if (place.photos?.[0]) {
          image.style.backgroundImage = `url("${place.photos[0].getUrl({ maxWidth: 700, maxHeight: 420 })}")`;
        }

        const content = document.createElement("div");
        content.className = "recommendation-card-content";
        content.innerHTML = `
          <span class="recommendation-type">${place.types?.[0]?.replaceAll("_", " ") || "Recommended stop"}</span>
          <h3></h3>
          <p></p>
          <div class="recommendation-meta"><span></span><span></span></div>
        `;
        content.querySelector("h3").textContent = place.name || "Recommended place";
        content.querySelector("p").textContent = place.formatted_address || "Near your destination";
        content.querySelector(".recommendation-meta span:first-child").textContent = place.rating ? `★ ${place.rating.toFixed(1)}` : "New place";
        content.querySelector(".recommendation-meta span:last-child").textContent = place.user_ratings_total ? `${place.user_ratings_total} reviews` : "Explore nearby";

        card.append(image, content);
        grid.appendChild(card);
      });
    }
  );
}

function setupLocationAutocomplete() {
  const startInput = document.getElementById("start");
  const destinationInput = document.getElementById("end");
  if (!startInput || !destinationInput || !google.maps.places?.Autocomplete) return;

  const startAutocomplete = new google.maps.places.Autocomplete(startInput, {
    fields: ["formatted_address", "geometry", "name", "place_id"]
  });

  const endAutocomplete = new google.maps.places.Autocomplete(destinationInput, {
    fields: ["formatted_address", "geometry", "name", "place_id"]
  });

  // Starting point autocomplete listener
  startAutocomplete.addListener("place_changed", () => {
    const place = startAutocomplete.getPlace();
    if (!place.geometry) {
      startInput.value = place.name || "";
      return;
    }
    
    const selectedValue = place.formatted_address || place.name;
    if (selectedValue) {
      startInput.value = selectedValue;
      startLocationData = {
        name: selectedValue,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
      };
      clearStatusMessage();
    }
  });

  // Destination autocomplete listener
  endAutocomplete.addListener("place_changed", () => {
    const place = endAutocomplete.getPlace();
    if (!place.geometry) {
      destinationInput.value = place.name || "";
      return;
    }
    
    const selectedValue = place.formatted_address || place.name;
    if (selectedValue) {
      destinationInput.value = selectedValue;
      endLocationData = {
        name: selectedValue,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
      };
    }
  });
}

function clearStatusMessage() {
  const status = document.getElementById("startingPointStatus");
  if (status) {
    status.textContent = "";
    status.className = "";
  }
}

function showStatusMessage(message, type = "info") {
  const status = document.getElementById("startingPointStatus");
  if (status) {
    status.textContent = message;
    status.className = type;
  }
}

// Setup "Use my current location" functionality
function setupCurrentLocationButton() {
  const button = document.getElementById("useCurrentLocation");
  if (!button) return;

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    
    if (!navigator.geolocation) {
      showStatusMessage("❌ Geolocation is not supported on this device.", "error");
      return;
    }

    button.disabled = true;
    showStatusMessage("📍 Detecting your location...", "loading");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        startLocationData = {
          name: "",
          lat: latitude,
          lng: longitude
        };

        // Try to reverse geocode the coordinates
        try {
          const geocoder = new google.maps.Geocoder();
          const response = await geocoder.geocode({
            location: { lat: latitude, lng: longitude }
          });

          if (response.results && response.results.length > 0) {
            const address = response.results[0].formatted_address;
            document.getElementById("start").value = address;
            startLocationData.name = address;
            showStatusMessage("✓ Current location detected", "success");
          } else {
            document.getElementById("start").value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            startLocationData.name = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            showStatusMessage("✓ Location detected (coordinates)", "success");
          }
        } catch (error) {
          console.error("Geocoding error:", error);
          document.getElementById("start").value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          startLocationData.name = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          showStatusMessage("✓ Location detected (coordinates)", "success");
        }

        button.disabled = false;
      },
      (error) => {
        let errorMessage = "Unable to detect your location. Please enter it manually.";
        
        if (error.code === 1) {
          errorMessage = "Location access was denied. You can enter your starting location manually.";
        } else if (error.code === 2) {
          errorMessage = "Your location is unavailable. Please enter it manually.";
        } else if (error.code === 3) {
          errorMessage = "Location request timed out. Please enter it manually.";
        }

        showStatusMessage(`❌ ${errorMessage}`, "error");
        button.disabled = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

// Fetch trips from Firestore
async function displayTrips(uid) {
  const tripList = document.getElementById("tripList");
  if (!tripList) return;
  tripList.innerHTML = "";
  const q = query(collection(db, "trips"), where("uid", "==", uid));
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach((doc) => {
    const trip = doc.data();
    let li = document.createElement("li");
    li.innerHTML = `${trip.date}: ${trip.start} → ${trip.end} | ${trip.distance} km | ₹${trip.fuelCost}`;
    tripList.appendChild(li);
  });
}

// Clear history from Firestore
async function clearHistory() {
  const user = auth.currentUser;
  if (!user) {
    alert("Please log in to clear history.");
    return;
  }
  const q = query(collection(db, "trips"), where("uid", "==", user.uid));
  const querySnapshot = await getDocs(q);
  for (const docSnap of querySnapshot.docs) {
    await docSnap.ref.delete();
  }
  displayTrips(user.uid);
}

window.onload = initMap;

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

let liveMap;
let directionsService;
let directionsRenderer;
let currentPositionMarker;
let currentLocation = null;
let tripData = null;
let tripStartTime = null;
let tripPaused = false;
let watchPositionId = null;
let tripElapsedTime = 0;
let tripTimer = null;
let routePolyline = null;

const FUEL_PRICES = {
  petrol: 103.5,
  diesel: 90.8
};

// Get trip data from sessionStorage
function loadTripData() {
  const stored = sessionStorage.getItem('currentTrip');
  if (!stored) {
    alert('No trip data found. Please plan a trip first.');
    window.location.href = 'index.html';
    return null;
  }
  return JSON.parse(stored);
}

// Initialize the live map
function initLiveMap() {
  tripData = loadTripData();
  if (!tripData) return;

  // Check if Google Maps API is available
  if (typeof google === 'undefined' || !google.maps) {
    console.error('Google Maps API not loaded');
    const mapDiv = document.getElementById('liveMap');
    if (mapDiv) {
      mapDiv.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white;"><span>Error loading map. Please refresh the page.</span></div>';
    }
    return;
  }

  // Update destination info
  document.getElementById('destinationName').textContent = tripData.end;
  document.getElementById('destinationAddress').textContent = tripData.end;

  // Initialize map
  const mapCenter = tripData.startCoords;
  try {
    liveMap = new google.maps.Map(document.getElementById('liveMap'), {
      zoom: 15,
      center: mapCenter,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      zoomControl: true,
      styles: getMapStyles()
    });
  } catch (error) {
    console.error('Error initializing map:', error);
    const mapDiv = document.getElementById('liveMap');
    if (mapDiv) {
      mapDiv.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white;"><span>Unable to load the live map.</span></div>';
    }
    return;
  }

  // Setup map listeners now that map is initialized
  setupMapListeners();

  // Initialize DirectionsService and DirectionsRenderer
  directionsService = new google.maps.DirectionsService();
  
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: liveMap,
    suppressMarkers: false,
    polylineOptions: {
      strokeColor: '#2dd4bf',
      strokeOpacity: 0.8,
      strokeWeight: 5
    }
  });

  // Add start marker
  new google.maps.Marker({
    position: tripData.startCoords,
    map: liveMap,
    title: 'Starting Point',
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#22c55e',
      fillOpacity: 0.9,
      strokeColor: 'white',
      strokeWeight: 2
    }
  });

  // Add destination marker
  new google.maps.Marker({
    position: tripData.endCoords,
    map: liveMap,
    title: 'Destination',
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#ef4444',
      fillOpacity: 0.9,
      strokeColor: 'white',
      strokeWeight: 2
    }
  });

  // Display the route with DirectionsService for proper polyline rendering
  displayRoute();
  
  // Start trip
  tripStartTime = Date.now();
  requestLocationAccess();
  
  // Start trip timer
  startTripTimer();
}

// Get map styling
function getMapStyles() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }]
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }]
    },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ color: '#263c3f' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#38414e' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry.stroke',
      stylers: [{ color: '#212a37' }]
    }
  ];
}

// Display route on map using DirectionsService
function displayRoute() {
  if (!directionsService || !liveMap) return;
  
  // Request directions to render the route polyline
  const request = {
    origin: tripData.startCoords,
    destination: tripData.endCoords,
    travelMode: google.maps.TravelMode.DRIVING
  };

  directionsService.route(request, (response, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(response);
      
      // Store the route for later use
      const route = response.routes[0];
      if (route && route.overview_path) {
        routePolyline = route.overview_path;
      }
      
      // Fit map to route bounds
      const bounds = new google.maps.LatLngBounds();
      response.routes[0].legs.forEach(leg => {
        bounds.extend(leg.start_location);
        bounds.extend(leg.end_location);
      });
      liveMap.fitBounds(bounds);
      
      console.log('[LiveTrip] Route displayed successfully');
    } else {
      console.error('[LiveTrip] Directions request failed:', status);
      // Fallback: center map on start/end points
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(tripData.startCoords);
      bounds.extend(tripData.endCoords);
      liveMap.fitBounds(bounds);
    }
  });
}

// Request location access
function requestLocationAccess() {
  if (!navigator.geolocation) {
    showLocationError('Geolocation is not supported on this device.');
    console.error('[LiveTrip] Geolocation not supported');
    return;
  }

  console.log('[LiveTrip] Requesting location access...');
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || 0
      };
      console.log('[LiveTrip] Initial location received:', currentLocation);
      updateCurrentLocation();
      startLocationTracking();
    },
    (error) => {
      let errorMessage = 'Unable to access your location.';
      if (error.code === 1) {
        errorMessage = 'Location access is disabled. Enable location access to see your live position.';
      } else if (error.code === 2) {
        errorMessage = 'Live location is unavailable. Using starting point as reference.';
      }
      console.warn('[LiveTrip] Location access error:', error.message);
      showLocationError(errorMessage);
      currentLocation = tripData.startCoords;
      updateCurrentLocation();
      startLocationTracking();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// Show location error
function showLocationError(message) {
  const errorDiv = document.getElementById('locationError');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Start continuous location tracking
function startLocationTracking() {
  console.log('[LiveTrip] Starting continuous location tracking...');
  
  watchPositionId = navigator.geolocation.watchPosition(
    (position) => {
      if (tripPaused) {
        console.log('[LiveTrip] Trip is paused, skipping location update');
        return;
      }

      const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || 0
      };

      currentLocation = newLocation;
      updateCurrentLocation();
      updateTripInfo();
      checkOffRoute();
      
      console.log('[LiveTrip] Location updated:', {lat: newLocation.lat.toFixed(4), lng: newLocation.lng.toFixed(4), speed: newLocation.speed?.toFixed(1) || 0});
    },
    (error) => {
      console.error('[LiveTrip] Location tracking error:', error.message, 'Code:', error.code);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
  
  console.log('[LiveTrip] Location tracking started with watchPositionId:', watchPositionId);
}

// Update current location on map
function updateCurrentLocation() {
  if (!liveMap || !currentLocation) return;

  if (currentPositionMarker) {
    currentPositionMarker.setPosition(currentLocation);
  } else {
    currentPositionMarker = new google.maps.Marker({
      position: currentLocation,
      map: liveMap,
      title: 'Your Location',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 3
      }
    });
  }

  // Auto-center map on user location (optional - can be disabled by user)
  if (shouldAutoCenterMap()) {
    liveMap.panTo(currentLocation);
  }
}

// Check if map should auto-center (simple implementation)
let autoCenter = true;
let userPanned = false;

function shouldAutoCenterMap() {
  return autoCenter && !userPanned;
}

// Add map listeners after map is initialized
function setupMapListeners() {
  if (liveMap) {
    liveMap.addListener('drag', () => {
      userPanned = true;
      autoCenter = false;
    });
    liveMap.addListener('zoom_changed', () => {
      userPanned = true;
    });
  }
}

// Update trip information panel
function updateTripInfo() {
  if (!currentLocation || !tripData) return;

  // Calculate remaining distance to destination
  const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(
    new google.maps.LatLng(currentLocation.lat, currentLocation.lng),
    new google.maps.LatLng(tripData.endCoords.lat, tripData.endCoords.lng)
  );
  const distanceKm = (distanceMeters / 1000).toFixed(2);

  document.getElementById('distanceRemaining').textContent = `${distanceKm} km`;

  // Calculate speed properly from geolocation data
  let speedKmh = 0;
  if (currentLocation.speed !== null && currentLocation.speed !== undefined) {
    // Convert m/s to km/h: speed (m/s) * 3.6 = km/h
    speedKmh = Math.max(0, currentLocation.speed * 3.6);
  }
  
  // Display speed with proper formatting
  if (currentLocation.speed !== null && currentLocation.speed !== undefined) {
    document.getElementById('currentSpeed').textContent = `${Math.round(speedKmh)} km/h`;
  } else {
    document.getElementById('currentSpeed').textContent = '-- km/h';
  }

  console.log('[LiveTrip] GPS Speed:', currentLocation.speed, 'm/s | Calculated:', speedKmh.toFixed(1), 'km/h');

  // Calculate time remaining (estimated)
  const avgSpeed = Math.max(speedKmh, 40); // Use current speed or minimum 40 km/h
  const timeHours = distanceKm / avgSpeed;
  const hours = Math.floor(timeHours);
  const minutes = Math.round((timeHours - hours) * 60);
  document.getElementById('timeRemaining').textContent = `${hours}h ${minutes}m`;

  // Calculate ETA
  const now = new Date();
  const eta = new Date(now.getTime() + (hours * 60 + minutes) * 60000);
  const etaStr = eta.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  document.getElementById('eta').textContent = etaStr;

  // Update elapsed trip time
  updateElapsedTime();

  // Update fuel information
  updateFuelInfo(parseFloat(distanceKm));
}

// Update fuel/battery information
function updateFuelInfo(remainingDistance) {
  if (!tripData) return;

  const fuelDetails = document.getElementById('fuelDetails');
  const fuelHeader = document.getElementById('fuelHeader');

  if (tripData.fuelType === 'ev') {
    fuelHeader.textContent = 'Battery Information';
    
    // Get vehicle data from localStorage
    const vehicles = JSON.parse(localStorage.getItem('roadTripProVehicles') || '[]');
    const vehicle = vehicles[0];

    if (vehicle && vehicle.fuelType === 'ev') {
      const batteryCapacity = parseFloat(vehicle.batteryCapacity) || 60;
      const realWorldRange = parseFloat(vehicle.realWorldRange) || 380;
      const currentBattery = parseFloat(vehicle.currentBattery) || 72;
      
      const consumptionRate = batteryCapacity / realWorldRange; // kWh per km
      const energyUsed = remainingDistance * consumptionRate;
      
      const remainingEnergy = (currentBattery / 100) * batteryCapacity;
      const estimatedRemainingRange = remainingEnergy / consumptionRate;

      fuelDetails.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Battery</div>
            <div style="font-size: 1rem; font-weight: 700; color: white;">${currentBattery.toFixed(0)}%</div>
          </div>
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Range</div>
            <div style="font-size: 1rem; font-weight: 700; color: white;">${estimatedRemainingRange.toFixed(0)} km</div>
          </div>
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Usage</div>
            <div style="font-size: 1rem; font-weight: 700; color: white;">${energyUsed.toFixed(2)} kWh</div>
          </div>
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Cost</div>
            <div style="font-size: 1rem; font-weight: 700; color: white;">₹${(remainingDistance * 1.35).toFixed(2)}</div>
          </div>
        </div>
      `;
    }
  } else {
    fuelHeader.textContent = 'Fuel Information';
    
    // Get vehicle data from localStorage
    const vehicles = JSON.parse(localStorage.getItem('roadTripProVehicles') || '[]');
    const vehicle = vehicles[0];

    if (vehicle) {
      const mileage = parseFloat(vehicle.mileage) || parseFloat(tripData.mileage) || 15;
      const fuelPrice = tripData.fuelPrice || FUEL_PRICES[tripData.fuelType] || 0;
      const fuelNeeded = remainingDistance / mileage;
      const estimatedCost = fuelNeeded * fuelPrice;

      fuelDetails.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Type</div>
            <div style="font-size: 1rem; font-weight: 700; color: white; text-transform: capitalize;">${tripData.fuelType}</div>
          </div>
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Mileage</div>
            <div style="font-size: 1rem; font-weight: 700; color: white;">${mileage.toFixed(1)} km/l</div>
          </div>
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Fuel Needed</div>
            <div style="font-size: 1rem; font-weight: 700; color: white;">${fuelNeeded.toFixed(2)} L</div>
          </div>
          <div style="background: rgba(45, 212, 191, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(45, 212, 191, 0.1);">
            <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Estimated Cost</div>
            <div style="font-size: 1rem; font-weight: 700; color: white;">₹${estimatedCost.toFixed(2)}</div>
          </div>
        </div>
      `;
    }
  }
}

// Check if user is off the planned route
function checkOffRoute() {
  if (!currentLocation || !tripData) return;

  // Use routePolyline if available
  const routePath = routePolyline || (tripData.route && tripData.route.overview_path);
  if (!routePath || routePath.length === 0) return;

  // Check distance from user to the nearest point on the route
  let minDistance = Infinity;
  
  for (let point of routePath) {
    const distance = google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(currentLocation.lat, currentLocation.lng),
      point
    );
    minDistance = Math.min(minDistance, distance);
  }

  const offRouteThreshold = 500; // meters
  const warning = document.getElementById('offRouteWarning');
  
  if (minDistance > offRouteThreshold) {
    warning.textContent = '⚠️ You\'re off the planned route.';
    warning.classList.add('show');
    console.log('[LiveTrip] Off-route detected. Distance from route:', (minDistance).toFixed(0), 'meters');
  } else {
    warning.classList.remove('show');
  }
}

// Start trip timer for elapsed time tracking
function startTripTimer() {
  tripTimer = setInterval(() => {
    if (!tripPaused) {
      updateElapsedTime();
    }
  }, 1000);
}

// Update elapsed trip time
function updateElapsedTime() {
  if (!tripStartTime) return;
  
  const now = Date.now();
  const elapsedMs = now - tripStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  
  // Update trip duration display if element exists
  const durationElement = document.getElementById('tripDuration');
  if (durationElement) {
    durationElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
  }
}

// Recenter map on current location
window.recenterMap = function() {
  if (liveMap && currentLocation) {
    autoCenter = true;
    userPanned = false;
    liveMap.panTo(currentLocation);
  }
};

// Toggle pause/resume trip
window.toggleTripPause = function() {
  tripPaused = !tripPaused;
  const btn = document.getElementById('pauseResumeBtn');
  const status = document.getElementById('tripStatus');

  if (tripPaused) {
    btn.textContent = 'Resume Trip';
    status.classList.add('paused');
    document.getElementById('tripStatusText').textContent = 'Trip paused';
    // Don't stop geolocation, just pause updates
    console.log('[LiveTrip] Trip paused');
  } else {
    btn.textContent = 'Pause Trip';
    status.classList.remove('paused');
    document.getElementById('tripStatusText').textContent = 'Trip in progress';
    console.log('[LiveTrip] Trip resumed');
  }
};

// End trip
window.endTrip = function() {
  const confirmed = confirm('Are you sure you want to end this trip?');
  if (!confirmed) return;

  // Stop location tracking
  if (watchPositionId) {
    navigator.geolocation.clearWatch(watchPositionId);
    watchPositionId = null;
  }

  // Stop trip timer
  if (tripTimer) {
    clearInterval(tripTimer);
    tripTimer = null;
  }

  // Calculate trip summary
  const tripDuration = Date.now() - tripStartTime;
  const durationMinutes = Math.floor(tripDuration / 60000);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  console.log('[LiveTrip] Ending trip. Duration:', hours, 'h', minutes, 'm');

  // Save trip completion to Firestore
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const tripRecord = {
          uid: user.uid,
          start: tripData.start,
          end: tripData.end,
          distance: tripData.distance,
          duration: `${hours}h ${minutes}m`,
          durationMinutes,
          fuelCost: tripData.fuelCost,
          fuelType: tripData.fuelType,
          actualTripDuration: tripDuration,
          completedAt: new Date().toLocaleString(),
          date: new Date().toLocaleString()
        };

        await addDoc(collection(db, "completedTrips"), tripRecord);
        
        // Store trip summary in sessionStorage
        sessionStorage.setItem('tripSummary', JSON.stringify({
          ...tripRecord,
          status: 'completed'
        }));

        console.log('[LiveTrip] Trip saved to Firestore');

        // Navigate to trip summary
        window.location.href = 'trip-summary.html';
      } catch (error) {
        console.error('[LiveTrip] Error saving trip:', error);
        alert('Error saving trip. Redirecting to summary...');
        window.location.href = 'trip-summary.html';
      }
    } else {
      alert('Please log in to complete the trip.');
      window.location.href = 'login.html?redirect=index.html';
    }
  });
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('[LiveTrip] Page loaded, waiting for Google Maps API...');
  
  // Wait a moment to ensure Google Maps API is loaded
  setTimeout(() => {
    if (typeof google === 'undefined' || !google.maps) {
      console.error('[LiveTrip] Google Maps API not loaded');
      const mapDiv = document.getElementById('liveMap');
      if (mapDiv) {
        mapDiv.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white;"><span>Error: Google Maps API failed to load</span></div>';
      }
      return;
    }
    
    console.log('[LiveTrip] Google Maps API loaded successfully');
    initLiveMap();
    
    // Update trip info every 2 seconds
    setInterval(() => {
      if (currentLocation && !tripPaused) {
        updateTripInfo();
      }
    }, 2000);
  }, 500);

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    if (watchPositionId) {
      navigator.geolocation.clearWatch(watchPositionId);
    }
    if (tripTimer) {
      clearInterval(tripTimer);
    }
  });
});

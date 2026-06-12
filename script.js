// =====================================================
// Apps Script 웹앱 URL - 배포 후 받은 URL로 교체하세요
// (예: https://script.google.com/macros/s/AKfycb.../exec)
// =====================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxNPc87i1EtQGXzPMimFa1elNb2D5yT_FYd3uSK_wwe3G0qFq0E9Y9QjpeVze3-bQqJmw/exec";

// =====================================================
// Firebase 설정 - 본인의 Firebase 프로젝트 설정으로 교체하세요
// =====================================================
  const firebaseConfig = {
    apiKey: "AIzaSyBJYjgM5bF-i0spqmYFzwSz0rXrSJsFXH4",
    authDomain: "jefferson-davis-c40d1.firebaseapp.com",
    databaseURL: "https://jefferson-davis-c40d1-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "jefferson-davis-c40d1",
    storageBucket: "jefferson-davis-c40d1.firebasestorage.app",
    messagingSenderId: "981476340214",
    appId: "1:981476340214:web:2a641f7f79c27ad4b2d7d7",
    measurementId: "G-YJ3GKC67YM"
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let currentUser = null;
  let currentUtterance = null;
  let visitedRegions = {}; // { regionName: { story, visitedAt } }

  // ===================== 화면 요소 =====================
  const loginScreen = document.getElementById('loginScreen');
  const mainScreen = document.getElementById('mainScreen');
  const myPageScreen = document.getElementById('myPageScreen');
  const storyModal = document.getElementById('storyModal');

  // ===================== 로그인 / 회원가입 =====================
  document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    auth.signInWithEmailAndPassword(email, password)
      .catch(err => showError(err.message));
  });

  document.getElementById('signupBtn').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    auth.createUserWithEmailAndPassword(email, password)
      .catch(err => showError(err.message));
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut();
  });

  function showError(msg) {
    document.getElementById('loginError').innerText = msg;
  }

  // ===================== 로그인 상태 감지 =====================
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      document.getElementById('userEmail').innerText = user.email;
      loginScreen.classList.add('hidden');
      mainScreen.classList.remove('hidden');
      myPageScreen.classList.add('hidden');
      initMap();
      refreshMap();
      loadVisitedRegions();
    } else {
      currentUser = null;
      loginScreen.classList.remove('hidden');
      mainScreen.classList.add('hidden');
      myPageScreen.classList.add('hidden');
    }
  });

  // ===================== 지역 데이터 =====================
  const REGIONS = [
    { name: "이집트 카이로", lat: 30.04, lng: 31.24 },
    { name: "그리스 아테네", lat: 37.98, lng: 23.73 },
    { name: "이탈리아 로마", lat: 41.90, lng: 12.50 },
    { name: "대한민국 경주", lat: 35.84, lng: 129.21 },
    { name: "중국 시안", lat: 34.34, lng: 108.94 },
    { name: "인도 델리", lat: 28.61, lng: 77.21 },
    { name: "프랑스 파리", lat: 48.86, lng: 2.35 },
    { name: "영국 런던", lat: 51.51, lng: -0.13 },
    { name: "멕시코 테오티우아칸", lat: 19.69, lng: -98.84 },
    { name: "페루 마추픽추", lat: -13.16, lng: -72.55 },
    { name: "튀르키예 이스탄불", lat: 41.01, lng: 28.98 },
    { name: "이라크 바그다드", lat: 33.31, lng: 44.36 }
  ];

  let leafletMap = null;
  const regionMarkers = {}; // { regionName: L.marker }

  function initMap() {
    if (leafletMap) return; // 이미 초기화됨

    leafletMap = L.map('leafletMap').setView([20, 30], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(leafletMap);

    REGIONS.forEach(region => {
      const marker = L.marker([region.lat, region.lng]).addTo(leafletMap);
      marker.bindPopup(
        `<div class="popup-region-name">📍 ${region.name}</div>` +
        `<button class="popup-btn" onclick="window.handleRegionClick('${region.name}')">이야기 듣기</button>`
      );
      regionMarkers[region.name] = marker;
    });
  }

  // 지도 크기 재계산 (화면 전환 시 타일이 깨지는 것 방지)
  function refreshMap() {
    if (leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }
  }

  // 팝업 버튼에서 호출 (전역 함수로 등록)
  window.handleRegionClick = function (regionName) {
    if (regionMarkers[regionName]) {
      regionMarkers[regionName].closePopup();
    }
    openStoryModal(regionName, regionMarkers[regionName]);
  };

  function markVisited(regionName) {
    const marker = regionMarkers[regionName];
    if (marker) {
      const icon = marker.getElement();
      if (icon) icon.classList.add('visited-pin');
    }
  }

  function openStoryModal(regionName, markerObj) {
    storyModal.classList.remove('hidden');
    document.getElementById('storyRegionName').innerText = '📍 ' + regionName;
    document.getElementById('storyText').innerText = '';
    document.getElementById('playTtsBtn').classList.add('hidden');
    document.getElementById('stopTtsBtn').classList.add('hidden');

    // 이미 방문한 지역이면 캐시된 이야기 사용
    if (visitedRegions[regionName]) {
      showStory(regionName, visitedRegions[regionName].story);
      return;
    }

    // 처음 방문하는 지역이면 Claude API 호출 (Apps Script 웹앱 경유)
    document.getElementById('storyLoading').classList.remove('hidden');

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // CORS 회피용 (Apps Script는 text/plain도 JSON으로 파싱 가능)
      body: JSON.stringify({ regionName: regionName })
    })
      .then(res => res.json())
      .then(data => {
        document.getElementById('storyLoading').classList.add('hidden');

        if (data.error) {
          document.getElementById('storyText').innerText = '오류가 발생했어요: ' + data.error;
          return;
        }

        showStory(regionName, data.story);
        saveVisitedRegion(regionName, data.story);
        markVisited(regionName);
      })
      .catch(err => {
        document.getElementById('storyLoading').classList.add('hidden');
        document.getElementById('storyText').innerText = '오류가 발생했어요: ' + err.message;
      });
  }

  function showStory(regionName, story) {
    document.getElementById('storyText').innerText = story;
    document.getElementById('playTtsBtn').classList.remove('hidden');
    document.getElementById('stopTtsBtn').classList.remove('hidden');
  }

  document.getElementById('closeModalBtn').addEventListener('click', () => {
    storyModal.classList.add('hidden');
    stopTts();
  });

  // ===================== TTS (Web Speech API) =====================
  document.getElementById('playTtsBtn').addEventListener('click', () => {
    const text = document.getElementById('storyText').innerText;
    stopTts();
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = 'ko-KR';
    currentUtterance.rate = 1.0;
    speechSynthesis.speak(currentUtterance);
  });

  document.getElementById('stopTtsBtn').addEventListener('click', stopTts);

  function stopTts() {
    speechSynthesis.cancel();
  }

  // ===================== Firestore: 방문 기록 저장/불러오기 =====================
  function saveVisitedRegion(regionName, story) {
    if (!currentUser) return;

    const data = {
      story: story,
      visitedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection('users').doc(currentUser.uid)
      .collection('visited_regions').doc(regionName)
      .set(data)
      .then(() => {
        visitedRegions[regionName] = { story: story, visitedAt: new Date() };
      })
      .catch(err => console.error('저장 오류:', err));
  }

  function loadVisitedRegions() {
    if (!currentUser) return;

    db.collection('users').doc(currentUser.uid)
      .collection('visited_regions').get()
      .then(snapshot => {
        visitedRegions = {};
        snapshot.forEach(doc => {
          visitedRegions[doc.id] = doc.data();
          markVisited(doc.id);
        });
      })
      .catch(err => console.error('불러오기 오류:', err));
  }

  // ===================== 마이페이지 =====================
  document.getElementById('myPageBtn').addEventListener('click', () => {
    mainScreen.classList.add('hidden');
    myPageScreen.classList.remove('hidden');
    renderMyPage();
  });

  document.getElementById('backToMapBtn').addEventListener('click', () => {
    myPageScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    refreshMap();
  });

  function renderMyPage() {
    const totalRegions = REGIONS.length;
    const visitedCount = Object.keys(visitedRegions).length;
    document.getElementById('progressText').innerText =
      `🌍 전체 ${totalRegions}개 지역 중 ${visitedCount}개 탐험 완료!`;

    const listEl = document.getElementById('visitedList');
    listEl.innerHTML = '';

    Object.keys(visitedRegions).forEach(regionName => {
      const item = visitedRegions[regionName];
      const div = document.createElement('div');
      div.className = 'visited-item';

      const dateStr = item.visitedAt && item.visitedAt.toDate
        ? item.visitedAt.toDate().toLocaleDateString('ko-KR')
        : '';

      div.innerHTML = `
        <h4>📍 ${regionName}</h4>
        <p>${item.story}</p>
        <div class="date">${dateStr}</div>
      `;

      div.addEventListener('click', () => {
        myPageScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
        refreshMap();
        openStoryModal(regionName, regionMarkers[regionName]);
      });

      listEl.appendChild(div);
    });

    if (visitedCount === 0) {
      listEl.innerHTML = '<p class="hint">아직 탐험한 지역이 없어요. 지도에서 마커를 눌러보세요!</p>';
    }
  }

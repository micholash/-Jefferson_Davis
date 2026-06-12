// =====================================================
// Apps Script 웹앱 URL - 배포 후 받은 URL로 교체하세요
// (예: https://script.google.com/macros/s/AKfycb.../exec)
// =====================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbygk9y-R68WZeuffZop7mMkiezGgTYwtitETqPqDQa2HBzjdb0ZIlCW16igvgV7cMtD/exec";

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

  // 디버깅용: firebaseConfig가 설정되지 않았으면 경고
  if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.warn('⚠️ firebaseConfig가 아직 설정되지 않았습니다. Firebase 콘솔의 설정값으로 교체하세요.');
  }

  let currentUser = null;
  let currentUtterance = null;
  let visitedRegions = {}; // { regionName: { story, visitedAt } }

  // ===================== 화면 요소 =====================
  const loginScreen = document.getElementById('loginScreen');
  const mainScreen = document.getElementById('mainScreen');
  const myPageScreen = document.getElementById('myPageScreen');
  const storyModal = document.getElementById('storyModal');

  // ===================== Google 로그인 =====================
  document.getElementById('googleLoginBtn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
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

  // ===================== 국가명 영→한 매핑 =====================
  // GeoJSON의 "name" 속성(영문)을 한국어 지역명으로 변환
  // 매핑에 없는 국가를 클릭하면 영문명을 그대로 사용
  const COUNTRY_NAME_KO = {
    "Egypt": "이집트",
    "Greece": "그리스",
    "Italy": "이탈리아",
    "South Korea": "대한민국",
    "Republic of Korea": "대한민국",
    "China": "중국",
    "India": "인도",
    "France": "프랑스",
    "United Kingdom": "영국",
    "Mexico": "멕시코",
    "Peru": "페루",
    "Turkey": "튀르키예",
    "Iraq": "이라크",
    "Japan": "일본",
    "Germany": "독일",
    "Spain": "스페인",
    "Russia": "러시아",
    "United States of America": "미국",
    "Brazil": "브라질",
    "Iran": "이란",
    "Israel": "이스라엘",
    "Vietnam": "베트남",
    "Mongolia": "몽골",
    "Indonesia": "인도네시아",
    "Cambodia": "캄보디아",
    "Ethiopia": "에티오피아"
  };

  function toKoreanName(geoName) {
    return COUNTRY_NAME_KO[geoName] || geoName;
  }

  // GeoJSON 국가 경계 데이터 (Natural Earth 기반 공개 데이터)
  const GEOJSON_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

  let leafletMap = null;
  let geoLayer = null;
  const countryLayers = {}; // { 한국어이름: layer }

  function initMap() {
    if (leafletMap) return; // 이미 초기화됨

    leafletMap = L.map('leafletMap').setView([20, 30], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(leafletMap);

    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(geojson => {
        geoLayer = L.geoJSON(geojson, {
          className: 'country-layer',
          onEachFeature: (feature, layer) => {
            const koName = toKoreanName(feature.properties.name);
            countryLayers[koName] = layer;

            layer.on('click', () => {
              openStoryModal(koName);
            });

            // 방문한 국가면 즉시 표시
            if (visitedRegions[koName]) {
              layer.setStyle({ fillColor: '#27ae60', fillOpacity: 0.35, color: '#27ae60' });
            }
          }
        }).addTo(leafletMap);
      })
      .catch(err => {
        console.error('지도 데이터를 불러오지 못했습니다:', err);
      });
  }

  // 지도 크기 재계산 (화면 전환 시 타일이 깨지는 것 방지)
  function refreshMap() {
    if (leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }
  }

  function markVisited(regionName) {
    const layer = countryLayers[regionName];
    if (layer) {
      layer.setStyle({ fillColor: '#27ae60', fillOpacity: 0.35, color: '#27ae60' });
    }
  }

  function openStoryModal(regionName) {
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
    if (!currentUser) {
      console.error('저장 실패: 로그인된 사용자가 없습니다.');
      return;
    }

    const data = {
      story: story,
      visitedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection('users').doc(currentUser.uid)
      .collection('visited_regions').doc(regionName)
      .set(data)
      .then(() => {
        visitedRegions[regionName] = { story: story, visitedAt: new Date() };
        console.log('✅ Firestore 저장 성공:', regionName);
      })
      .catch(err => {
        console.error('❌ Firestore 저장 오류:', err.code, err.message);
      });
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
        console.log(`✅ 방문 기록 ${snapshot.size}건 불러옴`);
      })
      .catch(err => {
        console.error('❌ Firestore 불러오기 오류:', err.code, err.message);
      });
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
    const totalRegions = Object.keys(countryLayers).length;
    const visitedCount = Object.keys(visitedRegions).length;
    document.getElementById('progressText').innerText =
      `🌍 전체 ${totalRegions}개 국가 중 ${visitedCount}개 탐험 완료!`;

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
        openStoryModal(regionName);
      });

      listEl.appendChild(div);
    });

    if (visitedCount === 0) {
      listEl.innerHTML = '<p class="hint">아직 탐험한 지역이 없어요. 지도에서 국가를 클릭해보세요!</p>';
    }
  }


<script>
  // =====================================================
  // Firebase 설정 - 본인의 Firebase 프로젝트 설정으로 교체하세요
  // =====================================================
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
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
      loadVisitedRegions();
    } else {
      currentUser = null;
      loginScreen.classList.remove('hidden');
      mainScreen.classList.add('hidden');
      myPageScreen.classList.add('hidden');
    }
  });

  // ===================== 지도 마커 클릭 =====================
  document.querySelectorAll('.region-marker').forEach(marker => {
    marker.addEventListener('click', () => {
      const regionName = marker.getAttribute('data-region');
      openStoryModal(regionName, marker);
    });
  });

  function openStoryModal(regionName, markerEl) {
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

    // 처음 방문하는 지역이면 Claude API 호출 (Apps Script 경유)
    document.getElementById('storyLoading').classList.remove('hidden');

    google.script.run
      .withSuccessHandler(story => {
        document.getElementById('storyLoading').classList.add('hidden');
        showStory(regionName, story);
        saveVisitedRegion(regionName, story);
        if (markerEl) markerEl.classList.add('visited');
      })
      .withFailureHandler(err => {
        document.getElementById('storyLoading').classList.add('hidden');
        document.getElementById('storyText').innerText = '오류가 발생했어요: ' + err.message;
      })
      .getHistoryStory(regionName);
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
          // 지도에 방문 표시
          const marker = document.querySelector(`.region-marker[data-region="${doc.id}"]`);
          if (marker) marker.classList.add('visited');
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
  });

  function renderMyPage() {
    const totalRegions = document.querySelectorAll('.region-marker').length;
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
        openStoryModal(regionName, document.querySelector(`.region-marker[data-region="${regionName}"]`));
      });

      listEl.appendChild(div);
    });

    if (visitedCount === 0) {
      listEl.innerHTML = '<p class="hint">아직 탐험한 지역이 없어요. 지도에서 마커를 눌러보세요!</p>';
    }
  }
</script>

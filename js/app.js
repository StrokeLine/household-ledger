/**
 * 가계부 PWA 앱 - Google OAuth 인증
 */
(function () {
  'use strict';

  // ========== 설정 (js/config.js에서 로드) ==========
  var SCRIPT_URL = APP_CONFIG.SCRIPT_URL;
  var GOOGLE_CLIENT_ID = APP_CONFIG.GOOGLE_CLIENT_ID;

  // 카테고리 아이콘 매핑
  var CATEGORY_ICONS = {
    '식비': '🍚',
    '교통/차량': '🚗',
    '문화생활': '🎬',
    '마트/편의점': '🛒',
    '패션/미용': '👗',
    '생활용품': '🧹',
    '주거/통신': '🏠',
    '건강': '💊',
    '교육': '📚',
    '경조사/회비': '🎉',
    '부모님': '❤️',
    '기타': '📌'
  };

  var DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

  // ========== 상태 ==========
  var state = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    entries: [],
    filteredEntries: [],
    filter: 'all',
    user: null, // { email, name, picture }
    editingEntry: null
  };

  // ========== DOM 요소 ==========
  var $ = function (id) { return document.getElementById(id); };
  var listContainer = $('listContainer');
  var loading = $('loading');
  var formModal = $('formModal');
  var loginScreen = $('loginScreen');

  // ========== 초기화 ==========
  function init() {
    bindEvents();
    updateMonthDisplay();
    initGoogleAuth();
  }

  // ========== Google OAuth 초기화 ==========
  function initGoogleAuth() {
    // Google Identity Services 라이브러리 로드 대기
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(initGoogleAuth, 200);
      return;
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleLogin,
      auto_select: true // 재방문 시 자동 로그인
    });

    // 로그인 버튼 렌더링
    google.accounts.id.renderButton($('googleLoginBtn'), {
      theme: 'outline',
      size: 'large',
      width: 280,
      text: 'signin_with',
      shape: 'rectangular'
    });

    // 자동 로그인 시도 (One Tap)
    google.accounts.id.prompt();
  }

  // ========== Google 로그인 콜백 ==========
  function handleGoogleLogin(response) {
    // JWT 토큰 디코딩
    var payload = parseJwt(response.credential);

    state.user = {
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };

    // 로그인 화면 숨기기
    loginScreen.style.display = 'none';

    // 사용자 아바타 표시
    var avatar = $('userAvatar');
    avatar.src = state.user.picture;
    avatar.alt = state.user.name;
    $('btnUser').style.display = 'flex';

    // 데이터 로드
    loadData();
  }

  // ========== JWT 파싱 ==========
  function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  }

  // ========== 이벤트 바인딩 ==========
  function bindEvents() {
    // 월 이동
    $('btnPrevMonth').addEventListener('click', function () { changeMonth(-1); });
    $('btnNextMonth').addEventListener('click', function () { changeMonth(1); });

    // 필터 탭
    document.querySelectorAll('.filter-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.filter-tab').forEach(function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        state.filter = tab.dataset.filter;
        applyFilter();
        renderList();
      });
    });

    // FAB 버튼
    $('btnAdd').addEventListener('click', function () { openForm(null); });

    // 모달 닫기
    $('btnCloseModal').addEventListener('click', closeForm);
    formModal.addEventListener('click', function (e) {
      if (e.target === formModal) closeForm();
    });

    // 구분 토글 (개인/공용)
    document.querySelectorAll('.toggle-group').forEach(function (group) {
      var btns = group.querySelectorAll('.toggle-btn:not(.asset-btn)');
      if (btns.length > 0) {
        btns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            btns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
          });
        });
      }
    });

    // 자산 토글
    var assetBtns = document.querySelectorAll('.asset-btn');
    assetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        assetBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // 분류 선택
    var categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        categoryBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // 금액 입력 포맷
    $('inputAmount').addEventListener('input', function (e) {
      var raw = e.target.value.replace(/[^\d]/g, '');
      e.target.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    });

    // 폼 제출
    $('entryForm').addEventListener('submit', function (e) {
      e.preventDefault();
      saveEntry();
    });

    // 삭제 버튼
    $('btnDeleteEntry').addEventListener('click', function () {
      if (state.editingEntry && confirm('삭제하시겠습니까?')) {
        deleteEntry(state.editingEntry);
      }
    });

    // 사용자 아바타 클릭 → 로그아웃
    $('btnUser').addEventListener('click', function () {
      if (confirm(state.user.name + ' (' + state.user.email + ')\n\n로그아웃 하시겠습니까?')) {
        google.accounts.id.disableAutoSelect();
        state.user = null;
        loginScreen.style.display = 'flex';
        $('btnUser').style.display = 'none';
      }
    });
  }

  // ========== 월 이동 ==========
  function changeMonth(delta) {
    state.currentMonth += delta;
    if (state.currentMonth > 12) {
      state.currentMonth = 1;
      state.currentYear++;
    } else if (state.currentMonth < 1) {
      state.currentMonth = 12;
      state.currentYear--;
    }
    updateMonthDisplay();
    loadData();
  }

  function updateMonthDisplay() {
    $('currentMonth').textContent = state.currentYear + '년 ' + state.currentMonth + '월';
  }

  // ========== 데이터 로드 (JSONP) ==========
  function loadData() {
    if (!state.user) return;

    loading.style.display = 'block';
    loading.textContent = '불러오는 중...';

    var month = state.currentYear + '-' +
      String(state.currentMonth).padStart(2, '0');

    jsonpRequest({ action: 'list', month: month })
      .then(function (result) {
        loading.style.display = 'none';
        if (result.success) {
          state.entries = result.data;
          applyFilter();
          renderList();
          updateSummary();
        } else {
          showToast('데이터 로드 실패');
        }
      })
      .catch(function () {
        loading.style.display = 'none';
        showToast('네트워크 오류');
      });
  }

  // ========== 필터 ==========
  function applyFilter() {
    if (state.filter === 'all') {
      state.filteredEntries = state.entries;
    } else if (state.filter === 'personal') {
      state.filteredEntries = state.entries.filter(function (e) {
        return e.type === '개인';
      });
    } else if (state.filter === 'shared') {
      state.filteredEntries = state.entries.filter(function (e) {
        return e.type === '공용';
      });
    }
  }

  // ========== 요약 업데이트 ==========
  function updateSummary() {
    var income = 0;
    var expense = 0;

    state.entries.forEach(function (e) {
      expense += e.amount;
    });

    var balance = income - expense;

    $('totalIncome').textContent = formatAmount(income) + '원';
    $('totalExpense').textContent = formatAmount(expense) + '원';
    $('totalBalance').textContent = formatAmount(balance) + '원';
    $('totalBalance').className = 'summary-value ' + (balance >= 0 ? 'income' : 'expense');
  }

  // ========== 리스트 렌더링 ==========
  function renderList() {
    var cards = listContainer.querySelectorAll('.day-group, .empty-state');
    cards.forEach(function (el) { el.remove(); });

    var entries = state.filteredEntries;

    if (!entries.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-state-icon">📝</div>' +
        '<div class="empty-state-text">이번 달 내역이 없습니다<br>+ 버튼으로 추가해보세요</div>';
      listContainer.appendChild(empty);
      return;
    }

    // 일별 그룹핑
    var groups = {};
    entries.forEach(function (entry) {
      var dateKey = entry.date.substring(0, 10);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
    });

    var sortedDates = Object.keys(groups).sort().reverse();

    sortedDates.forEach(function (dateKey) {
      var dayEntries = groups[dateKey];
      var dayTotal = dayEntries.reduce(function (sum, e) { return sum + e.amount; }, 0);

      var parts = dateKey.split('-');
      var dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      var dayName = DAY_NAMES[dateObj.getDay()];
      var displayDate = parseInt(parts[1]) + '월 ' + parseInt(parts[2]) + '일 (' + dayName + ')';

      var groupEl = document.createElement('div');
      groupEl.className = 'day-group';

      var headerEl = document.createElement('div');
      headerEl.className = 'day-header';
      headerEl.innerHTML =
        '<span class="day-date">' + displayDate + '</span>' +
        '<span class="day-total">-' + formatAmount(dayTotal) + '원</span>';
      groupEl.appendChild(headerEl);

      dayEntries.forEach(function (entry) {
        groupEl.appendChild(createEntryCard(entry));
      });

      listContainer.appendChild(groupEl);
    });
  }

  function createEntryCard(entry) {
    var card = document.createElement('div');
    card.className = 'entry-card';

    var icon = CATEGORY_ICONS[entry.category] || '📌';
    var time = entry.date.substring(11, 16) || '';
    var badges = '';
    if (entry.type === '공용') {
      badges += '<span class="entry-badge shared">공용</span>';
    }

    // 본인 항목이 아닌 경우 표시
    var isOwner = state.user && entry.user === state.user.email;

    card.innerHTML =
      '<div class="entry-icon">' + icon + '</div>' +
      '<div class="entry-info">' +
        '<div class="entry-content">' + escapeHtml(entry.content || entry.category) + '</div>' +
        '<div class="entry-meta">' +
          '<span>' + time + '</span>' +
          '<span>' + escapeHtml(entry.asset || '') + '</span>' +
          '<span>' + escapeHtml(entry.userName || '') + '</span>' +
          badges +
        '</div>' +
      '</div>' +
      '<div class="entry-amount">-' + formatAmount(entry.amount) + '원</div>';

    // 본인 항목만 클릭(수정) 가능
    if (isOwner) {
      card.addEventListener('click', function () { openForm(entry); });
    } else {
      card.style.opacity = '0.85';
    }

    return card;
  }

  // ========== 폼 열기/닫기 ==========
  function openForm(entry) {
    state.editingEntry = entry;

    if (entry) {
      $('formTitle').textContent = '지출 수정';
      $('btnDeleteEntry').classList.remove('hidden');
      $('inputDate').value = entry.date.replace(' ', 'T');
      setToggle('.toggle-btn:not(.asset-btn)', entry.type || '개인');
      $('inputAmount').value = entry.amount ? Number(entry.amount).toLocaleString('ko-KR') : '';
      setCategory(entry.category);
      setToggle('.asset-btn', entry.asset || '현금');
      $('inputContent').value = entry.content || '';
      $('inputMemo').value = entry.memo || '';
    } else {
      $('formTitle').textContent = '지출 입력';
      $('btnDeleteEntry').classList.add('hidden');
      $('entryForm').reset();
      var now = new Date();
      var dateStr = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + 'T' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0');
      $('inputDate').value = dateStr;
      setToggle('.toggle-btn:not(.asset-btn)', '개인');
      setToggle('.asset-btn', '현금');
      clearCategory();
    }

    formModal.classList.remove('hidden');
  }

  function closeForm() {
    formModal.classList.add('hidden');
    state.editingEntry = null;
  }

  function setToggle(selector, value) {
    document.querySelectorAll(selector).forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  function setCategory(value) {
    document.querySelectorAll('.category-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  function clearCategory() {
    document.querySelectorAll('.category-btn').forEach(function (btn) {
      btn.classList.remove('active');
    });
  }

  // ========== 저장 ==========
  function saveEntry() {
    var activeType = document.querySelector('.toggle-btn:not(.asset-btn).active');
    var activeCategory = document.querySelector('.category-btn.active');
    var activeAsset = document.querySelector('.asset-btn.active');

    if (!activeCategory) { showToast('분류를 선택해주세요'); return; }

    var rawAmount = $('inputAmount').value.replace(/[^\d]/g, '');
    if (!rawAmount || Number(rawAmount) === 0) { showToast('금액을 입력해주세요'); return; }

    var dateValue = $('inputDate').value.replace('T', ' ');

    var params = {
      action: state.editingEntry ? 'update' : 'add',
      rowIndex: state.editingEntry ? state.editingEntry.rowIndex : '',
      date: dateValue,
      user: state.user.email,
      userName: state.user.name,
      type: activeType ? activeType.dataset.value : '개인',
      amount: Number(rawAmount),
      category: activeCategory.dataset.value,
      asset: activeAsset ? activeAsset.dataset.value : '현금',
      content: $('inputContent').value.trim(),
      memo: $('inputMemo').value.trim()
    };

    var btnSave = $('btnSave');
    btnSave.disabled = true;
    btnSave.textContent = '저장 중...';

    jsonpRequest(params)
      .then(function (result) {
        btnSave.disabled = false;
        btnSave.textContent = '저장';
        if (result.success) {
          showToast(state.editingEntry ? '수정되었습니다' : '저장되었습니다');
          closeForm();
          loadData();
        } else {
          showToast('저장 실패: ' + (result.message || ''));
        }
      })
      .catch(function () {
        btnSave.disabled = false;
        btnSave.textContent = '저장';
        showToast('저장 실패');
      });
  }

  // ========== 삭제 ==========
  function deleteEntry(entry) {
    var month = state.currentYear + '-' +
      String(state.currentMonth).padStart(2, '0');

    jsonpRequest({
      action: 'delete',
      rowIndex: entry.rowIndex,
      month: month
    })
      .then(function (result) {
        if (result.success) {
          showToast('삭제되었습니다');
          closeForm();
          loadData();
        } else {
          showToast('삭제 실패');
        }
      })
      .catch(function () {
        showToast('삭제 실패');
      });
  }

  // ========== JSONP 요청 (CORS 우회) ==========
  function jsonpRequest(params) {
    return new Promise(function (resolve, reject) {
      var callbackName = 'gasCb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      var script = document.createElement('script');

      var query = Object.keys(params).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key] == null ? '' : params[key]);
      }).join('&');

      window[callbackName] = function (result) {
        delete window[callbackName];
        if (document.body.contains(script)) document.body.removeChild(script);
        resolve(result);
      };

      script.src = SCRIPT_URL + '?' + query + '&callback=' + callbackName;
      script.onerror = function () {
        delete window[callbackName];
        if (document.body.contains(script)) document.body.removeChild(script);
        reject(new Error('요청 실패'));
      };

      document.body.appendChild(script);

      setTimeout(function () {
        if (window[callbackName]) {
          delete window[callbackName];
          if (document.body.contains(script)) document.body.removeChild(script);
          reject(new Error('타임아웃'));
        }
      }, 15000);
    });
  }

  // ========== 유틸리티 ==========
  function formatAmount(num) {
    return Math.abs(num).toLocaleString('ko-KR');
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 2500);
  }

  // ========== Service Worker ==========
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  // ========== 시작 ==========
  document.addEventListener('DOMContentLoaded', function () {
    init();
    registerServiceWorker();
  });
})();

# research-graph — 작업 진행 기록

> 마지막 업데이트: 2026-06-28

연구 논문을 개인 지식 그래프로 시각화하는 프론트엔드 웹앱. arXiv 분야를 등록하면 논문을 자동으로 가져와 d3-force 그래프로 보여주고, 인용 데이터로 SOTA 논문을 자동 검출한다. GitHub Pages 배포 대상(순수 프론트엔드, 백엔드 없음).

## 이번 세션 업데이트 (2026-06-28)

배포가 라이브 상태가 됐고, 그래프 연결 알고리즘을 **의미 기반 임베딩**으로 업그레이드했다. 시간순 변경:

1. **리스트 그래프/정렬 분리 + 인용수 표시** (`aaedc93`)
   - `filteredPapers`를 둘로 분리: `graphPapers`(정렬 안 함 → 정렬 바꿔도 그래프 레이아웃 유지) / `sortedPapers`(리스트용, Newest=발행일 / Most cited=인용수 정렬).
   - "Most cited" 정렬 시 각 논문 항목에 `N cited` 표시 (`PapersPanel`의 `.metaRight`/`.cites`).
2. **의미 기반 그래프 엣지 (임베딩)** (`4cf2e80`) — 핵심
   - 기존 Jaccard 키워드 겹침 → **문장 임베딩 코사인 유사도**로 교체.
   - `@huggingface/transformers`(transformers.js) + `Xenova/all-MiniLM-L6-v2`(384차원, q8 양자화)를 **브라우저에서** 실행. 백엔드/API키 불필요, 논문 텍스트 외부 전송 없음.
   - 벡터는 **별도 IndexedDB**(`catu-embeddings`)에 캐시(기존 `research-graph` DB 버전 안 건드림). transformers는 **지연 로딩**(별도 청크)이라 초기 번들/첫 렌더는 가볍게 유지.
   - 그래프는 처음엔 키워드 링크로 즉시 그리고, 벡터 준비되면 **재배치 없이 엣지만 의미 기반으로 교체**(force 링크 in-place + 부드러운 reheat). 좌상단에 "Analyzing meaning… n/total" 상태 표시, 실패 시 키워드 링크로 폴백.
   - 링크 생성: 코사인 ≥ threshold(기본 0.4)인 이웃을 노드당 top-K(기본 6)만 연결(hairball 방지), strength는 [0,1]로 재정규화해 기존 거리/굵기/투명도 공식 재사용.
   - 검증: Node 스모크 테스트로 "단어 안 겹쳐도 의미 비슷하면 코사인↑"(CNN↔이미지 0.52, transformer↔번역 0.63 / 무관 쌍 ≤0.2) 확인.
3. **SOTA 노드 클릭 이동 버그 수정 + 검색 디바운스** (`3fdb376`)
   - 버그: 리스트 스크롤 effect가 `[selectedId]`에만 반응 → 다른 페이지에 있는 논문(주로 SOTA)은 페이지 넘어가기 전에 스크롤 시도→무동작, 페이지 바뀐 뒤엔 재실행 안 됨. deps에 `papers`(현재 페이지) 추가로 해결.
   - 검색 입력 **250ms 디바운스**(`searchInput`→`search`)로 타이핑 중 그래프 매 글자 재빌드 방지(렉 완화). 입력창은 즉시 반응.
   - 그래프 클릭 핸들러의 stale `selectedId` → ref로 교체(선택 노드 재클릭 시 해제).
4. **코드리뷰 수정** (`593617a`)
   - 저장/SOTA 토글 시 그래프 재빌드가 키워드 링크로 초기화하고 의미 링크 effect가 재실행 안 돼 **의미 엣지가 키워드로 되돌아가던 회귀** 수정. 빌드 effect가 최신 벡터(ref)를 읽어 재빌드 때도 바로 의미 링크로 그림(`linksFor`).
5. **헤더 선인장 마크** (`dab6243`, `593c7c7`)
   - "catu" 옆에 favicon과 같은 ASCII 선인장을 **배경 없는 인라인 SVG**로 추가(헤더 배경이 양 테마에서 그대로 비침), 40×30px.

**커밋 신원**: 이번 세션부터 작성자 = `gleipnir99 <gleipnir909@gmail.com>`(로컬 git config), Claude 공동작성자 트레일러 없음. main 히스토리·GitHub 기여자 통계 모두 gleipnir99 단독으로 정리됨(claude/mingoo 흔적 없음 확인).

**미해결/보류** (코드리뷰에서 식별, 추후):
- 저장/SOTA 토글 시 그래프 **전체 재레이아웃**(기존부터 있던 동작). 노드 색/링/힘만 제자리 갱신하도록 고치려면 링 DOM 추가/제거 리팩터 필요 → 브라우저 검증 가능할 때 진행 권장.
- 토픽 빠른 전환 시 임베딩 동시 실행(영향 낮음, `ignore` 플래그로 결과 폐기).
- 검색은 여전히 substring 매칭 → 의미 기반 검색으로 확장 여지(선택 기능).

## 기술 스택

- React 19 + Vite 8 (`base: '/catu/'`)
- d3-force 그래프 (d3 v7), d3-zoom (휠 전용)
- **transformers.js (`@huggingface/transformers`)** — 브라우저 내장 문장 임베딩(MiniLM)으로 그래프 의미 유사도
- IndexedDB (`idb`) — ① `research-graph`: 담기/읽음/SOTA 상태, ② `catu-embeddings`: 논문 임베딩 벡터 캐시
- 배포: **GitHub Actions → GitHub Pages 자동 배포 (라이브)**. 사이트: https://gleipnir99.github.io/catu/ . (`gh-pages` 패키지도 설치돼 있으나 Actions 경로 사용)

## 3분할 레이아웃

- **좌** CategoryPanel — 분야/검색 추가. arXiv 코드(`cs.CV`)면 `cat:` 최신순, 그 외는 `all:키워드` **관련도순**(IEEE Xplore식 전문 검색). 예: `surgical` → 수술 논문
- **중** GraphView — d3-force 노드, **의미 유사도(임베딩 코사인) 엣지**(벡터 준비 전엔 키워드 Jaccard 폴백), **인용 농도 토글**(노드 색 진하기 = 인용수)
- **우** PapersPanel — 논문 목록(**20개/페이지 페이지네이션**, `PAGE_SIZE`), 검색 + **키워드 칩 필터(AND/OR)** + **정렬(Newest/Most cited)**, 담기/SOTA 토글. 노드 클릭 시 해당 논문 페이지로 이동 + 스크롤
- UI 텍스트는 모두 영어. 파비콘은 Claude Buddy의 ASCII 선인장(녹색, `public/favicon.svg`)

## 데이터 소스 (3개 병렬 fetch)

`Promise.allSettled`로 동시 호출 후 제목 정규화로 중복 제거:

1. **arXiv** (`src/lib/arxiv.js`) — Atom XML, 소스당 300개(`RESULTS_PER_SOURCE`). CORS 직접 fetch → corsproxy.io 폴백.
   - `fetchArxivPapers(query)`: 최신순 조회
   - `fetchArxivByIds(ids)`: ID 목록 일괄 조회 (SOTA 메타데이터 보강용)
   - arXiv ID는 버전 접미사(`v1`/`v2`) 제거해 OpenAlex와 매칭/중복제거 정합성 확보
2. **IEEE Xplore** (`src/lib/ieee.js`) — API 키 필요. 키는 `localStorage('ieee_api_key')`에서 읽음(인앱 입력 UI는 제거, 코드/스토리지로 주입 예정). 키 없으면 빈 배열 반환(앱 정상 동작). **아직 실제 키로 미검증.**
3. **OpenAlex (SOTA 자동 검출)** (`src/lib/sota.js`) — API 키 불필요, CORS 지원.
   - arXiv 카테고리 → OpenAlex 개념 ID 매핑(`CONCEPT_MAP`)
   - 2023–2026년 + 인용 8회 초과 논문을 인용수 내림차순 조회
   - arXiv ID 추출 후 상위 10개는 arXiv에서 실제 메타데이터 재조회 (OpenAlex 제목 오라벨링 보정)
   - 반환: `{ sotaIds: Set, sotaPapers: [] }` — 목록에 없는 SOTA는 최대 8개 추가

## SOTA 표시 방식 — 3-tier 계보 (하이브리드)

학계 SOTA = "(벤치마크 데이터셋 × 지표) 최고 점수 모델". 인용수는 유명세일 뿐이라, **Papers with Code 벤치마크 리더보드**로 진짜 계보를 깔고 인용 검출을 폴백으로 둔다.

- **current**(금색 `--sota-current`, 실선 링): PwC 벤치마크 **1위** 논문 → 배지 `SOTA · <벤치마크>`
- **former**(회청 `--sota-former`, 점선 링): PwC 벤치 등재·2~10위 → 배지 `former SOTA`
- **fallback**(파랑 `--sota-fallback`): PwC 미등재 + OpenAlex 고인용 → 배지 `고인용 <인용수>`
- 우선순위: PwC tier > 수동 토글(=current) > OpenAlex 폴백. `App.jsx`의 `sotaTier` Map(`id → tier`)으로 병합해 GraphView/PapersPanel에 전달.
- 중앙 배치(`forceRadial` 반경 80): current 강(0.5)·former 약(0.25)·나머지 0.

### PwC 데이터 파이프라인 (오프라인, 런타임 의존성 0)

Papers with Code는 2025-07 Meta가 종료 → 리더보드 덤프(sota-extractor 포맷)가 HF `pwc-archive/files`에 정적 보존(2025 중반 고정).

- `scripts/build-sota.mjs` (`npm run build:sota`): 덤프 다운로드/캐시(`scripts/.cache`, gitignore) → (데이터셋×지표)별 랭킹 → `paper_url`에서 arXiv ID 매칭 → tier 산출 → `src/data/sota-index.json`(커밋, ~928KB / 5642건).
- 지표 방향(낮을수록 좋음: error/WER/FID/MAE… )은 메트릭명 휴리스틱(`LOWER_BETTER`), 날짜 ≥2022만 보존.
- 조회: `src/lib/sota.js`의 `getPwcTier(id)` / `getPwcInfo(id)`. 기존 `fetchSotaPapers`(OpenAlex)는 폴백으로 유지.

## 테마 — Night Owl (Night / Noon 토글)

- `src/index.css`: `:root[data-theme="night"]`(Night Owl 다크 `#011627`) / `[data-theme="noon"]`(Light Owl 라이트) 두 변수 세트. SOTA tier 색은 테마 무관 `--sota-*`로 공유.
- `App.jsx`: `theme` state → `<html data-theme>` 적용 + `localStorage('rg_theme')` 저장/복원(기본 night). `index.html` 인라인 스크립트로 첫 페인트 FOUC 방지.
- 상단바 ☾/☀ 토글 버튼(`.theme-toggle`). 하드코딩 색(`#2d6a9f`/`#c0392b` 등) → `color-mix` + 변수로 정리.

## 그래프 상호작용

- 노드/논문 클릭 → 해당 노드 중앙으로 pan+zoom (FOCUS_SCALE 1.3)
- 휠로만 줌, 더블클릭 줌 비활성
- 그래프는 **필터된 집합(`graphPapers`)만 렌더** — 검색(디바운스)/키워드 칩이 그래프를 직접 좁힘(비매칭 노드 제거). 필터 없으면 전체(최대 300) 표시. 리스트만 페이지네이션(`sortedPapers`), 그래프는 전체 매칭 표시
- **키워드 칩 필터**: `App.jsx`가 현재 논문에서 상위 16개 키워드 추출 → PapersPanel 칩. AND(모두 포함)/OR(하나라도) 토글. 검색어와 결합돼 `matchIds`로 그래프/목록 동시 필터
- **인용 농도 모드**: GraphView 우상단 토글. 켜면 노드 색을 `scaleSequentialLog(interpolateOranges)`로 인용수↑=진하게. 인용수는 `lib/citations.js`가 OpenAlex에서 전체 논문 일괄 조회(`citationCounts` Map, papers와 분리해 그래프 재배치 방지)
- 엣지: **임베딩 코사인 유사도**(`lib/embeddings.js`의 `computeLinksSemantic`, threshold 0.4 / top-K 6), 굵기·투명도로 강도 표현. 벡터 미준비 시 키워드 Jaccard(`computeLinks`, ≥0.08)로 폴백. 선택은 `linksFor`가 결정
- 검색은 **250ms 디바운스** 후 `matchIds`에 반영(타이핑 중 그래프 재빌드 억제)
- 키워드 추출(폴백·칩용): IEEE는 구조화된 index_terms, arXiv/기타는 제목+초록 NLP (arXiv 카테고리 태그는 과연결 유발해 제외)
- `useEffect` 분리: 데이터 재빌드 / **임베딩 도착 시 엣지 in-place 교체** / 선택 스타일 / 인용 농도 recolor — 클릭·토글 시 시뮬레이션 전체 재시작 방지

## 주요 파일

```
scripts/build-sota.mjs       # PwC 덤프 → sota-index.json 가공 (npm run build:sota)
src/
├── App.jsx                  # 3소스 병렬 fetch, 중복제거, sotaTier 병합, 테마 토글, IEEE 키
├── data/sota-index.json     # 번들 SOTA 인덱스 (id → {tier,benchmark,metric,rank,…})
├── index.css               # [data-theme] Night/Noon 변수 + --sota-* tier 색
├── components/
│   ├── CategoryPanel.jsx
│   ├── GraphView.jsx        # d3-force, tier별 색/링/radial, 줌
│   └── PapersPanel.jsx      # 검색, 담기/SOTA 토글, tier 배지(SOTA·벤치/former/고인용)
└── lib/
    ├── arxiv.js             # fetchArxivPapers(cat:최신순/all:관련도순), fetchArxivByIds
    ├── ieee.js              # fetchIEEEPapers
    ├── citations.js         # fetchCitationCounts (OpenAlex DOI 배치 → 인용 농도/배지)
    ├── sota.js              # getPwcTier/getPwcInfo (PwC), fetchSotaPapers (OpenAlex 폴백)
    ├── topics.js            # 분야→arXiv/IEEE 쿼리 변환
    ├── keywords.js          # extractKeywords, computeLinks (Jaccard, 폴백/칩용)
    ├── embeddings.js        # transformers.js MiniLM 임베딩 + 캐시(catu-embeddings DB) + computeLinksSemantic (코사인 top-K)
    └── db.js                # IndexedDB: savePaper/markRead/toggleSota/카테고리
```

## 검증 완료 (2026-06-28)

### 이번 세션
- `npm run build` / `oxlint` 통과 (transformers 별도 청크로 분리, 메인 번들 ~244KB gzip 유지)
- **임베딩 의미 검증 (Node 스모크)**: 단어 미겹침 관련 쌍 코사인 0.52/0.63, 무관 쌍 ≤0.2 — threshold 0.4가 깔끔히 분리
- 배포 4회 모두 GitHub Actions success → 라이브 sha 일치 확인 (`https://gleipnir99.github.io/catu/`)
- 헤더 선인장: sharp로 night/noon 렌더 미리보기 → 잘림 없음 + 배경 블렌딩 확인
- 기여자 통계: GitHub `stats/contributors`·`/contributors` 모두 `gleipnir99` 단독(13커밋), claude/mingoo 없음
- ⚠️ 브라우저 실사용 확인은 못 함(Chrome 확장 미연결) — 사용자 측 확인 필요(특히 저장/SOTA 토글 동작, 의미 그래프 시각)

### 이전 세션
- 빌드 정상 (597 모듈), oxlint 통과
- **3-tier SOTA 동작 (cs.CV, 브라우저 확인)**: SAM 2 = 금색 `SOTA · MOSE`(현재), Segment Anything·SDXL = 회청 점선 `former SOTA`(과거), Vision Mamba = 파랑 `고인용 397`(폴백) — 콘솔 오류 없음
- **Night Owl 테마 토글**: Night(다크) ↔ Noon(라이트) 즉시 전환, tier 색/강조색 정상 적응
- **자유 키워드 검색**: `surgical` 입력 → 수술 논문 20건(Surgical-VQA/SurgiPose/CholecTrack20…), 칩도 수술 도메인으로 갱신
- **인용 농도 모드**: 고인용 고전 논문 진한 주황 vs 최신 논문 옅은 색으로 명확히 구분
- **키워드 칩 필터(AND/OR)**: 칩 클릭 시 그래프 디밍 + 목록 좁힘 동작
- (이전) arXiv 메타데이터 보강으로 OpenAlex 오라벨링("Micrograph segmentations…" → "Segment Anything") 해결

## TODO (다음에)

- [x] GitHub Pages 배포 (GitHub Actions 자동 배포, 라이브)
- [x] 그래프 엣지 의미 기반(임베딩) 업그레이드
- [ ] 저장/SOTA 토글 시 그래프 전체 재레이아웃 제거(노드 속성만 in-place 갱신) — 브라우저 검증하며 진행
- [ ] 의미 기반 검색(검색어 임베딩 → 유사 논문) 확장 검토
- [ ] 임베딩 threshold/top-K 튜닝(그래프 밀도) — 현재 0.4 / 6
- [ ] noon 테마에서 선인장 초록 대비 조정(선택)
- [ ] IEEE API 키 발급(developer.ieee.org) 후 end-to-end 검증
- [ ] cs.LG 등 다른 분야에서 tier 분류 확인
- [ ] PwC 덤프 2025 중반 고정 → 이후 논문은 폴백만. 주기적 `build:sota` 또는 신규 리더보드 소스 검토
- [ ] (원래 기획) Chrome 확장: 현재 arXiv 논문 담기

## 실행

```bash
npm run dev        # http://localhost:5173/catu/
npm run build
npm run build:sota # PwC 덤프 → src/data/sota-index.json 재생성 (선택, 결과는 커밋됨)
```

## 배포 (GitHub Pages, GitHub Actions)

- `main`에 push → `.github/workflows/deploy.yml`가 빌드 후 Pages에 자동 배포
- 저장소 Settings → Pages → Source = **GitHub Actions**
- `vite.config.js`의 `base`는 저장소명과 일치해야 함 (`/catu/`)
- 사이트 주소: `https://<사용자명>.github.io/catu/`

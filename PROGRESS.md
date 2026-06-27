# research-graph — 작업 진행 기록

> 마지막 업데이트: 2026-06-28

연구 논문을 개인 지식 그래프로 시각화하는 프론트엔드 웹앱. arXiv 분야를 등록하면 논문을 자동으로 가져와 d3-force 그래프로 보여주고, 인용 데이터로 SOTA 논문을 자동 검출한다. GitHub Pages 배포 대상(순수 프론트엔드, 백엔드 없음).

## 기술 스택

- React 18 + Vite (`base: '/research-graph/'`)
- d3-force 그래프 (d3 v7), d3-zoom (휠 전용)
- IndexedDB (`idb`) — 담기/읽음/SOTA 상태 로컬 저장
- 배포: `gh-pages` 패키지 (아직 배포 전)

## 3분할 레이아웃

- **좌** CategoryPanel — 분야/검색 추가. arXiv 코드(`cs.CV`)면 `cat:` 최신순, 그 외는 `all:키워드` **관련도순**(IEEE Xplore식 전문 검색). 예: `surgical` → 수술 논문
- **중** GraphView — d3-force 노드, 키워드 유사도(Jaccard) 엣지, **인용 농도 토글**(노드 색 진하기 = 인용수)
- **우** PapersPanel — 논문 목록, 키워드 검색 + **키워드 칩 필터(AND/OR)**, 담기/SOTA 토글

## 데이터 소스 (3개 병렬 fetch)

`Promise.allSettled`로 동시 호출 후 제목 정규화로 중복 제거:

1. **arXiv** (`src/lib/arxiv.js`) — Atom XML, 최신 20개. CORS 직접 fetch → corsproxy.io 폴백.
   - `fetchArxivPapers(query)`: 최신순 조회
   - `fetchArxivByIds(ids)`: ID 목록 일괄 조회 (SOTA 메타데이터 보강용)
   - arXiv ID는 버전 접미사(`v1`/`v2`) 제거해 OpenAlex와 매칭/중복제거 정합성 확보
2. **IEEE Xplore** (`src/lib/ieee.js`) — API 키 필요. topbar "IEEE +" 버튼으로 키 입력, `localStorage('ieee_api_key')` 저장. 키 없으면 빈 배열 반환(앱 정상 동작). **아직 실제 키로 미검증.**
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
- 키워드 검색 → 비매칭 노드 흐리게(opacity 0.18), 시뮬레이션 재시작 없음
- **키워드 칩 필터**: `App.jsx`가 현재 논문에서 상위 16개 키워드 추출 → PapersPanel 칩. AND(모두 포함)/OR(하나라도) 토글. 검색어와 결합돼 `matchIds`로 그래프/목록 동시 필터
- **인용 농도 모드**: GraphView 우상단 토글. 켜면 노드 색을 `scaleSequentialLog(interpolateOranges)`로 인용수↑=진하게. 인용수는 `lib/citations.js`가 OpenAlex에서 전체 논문 일괄 조회(`citationCounts` Map, papers와 분리해 그래프 재배치 방지)
- 엣지: Jaccard 유사도 ≥ 0.08, 굵기·투명도로 강도 표현
- 키워드 추출: IEEE는 구조화된 index_terms, arXiv/기타는 제목+초록 NLP (arXiv 카테고리 태그는 과연결 유발해 제외)
- `useEffect` 분리: 데이터 재빌드 / 선택 스타일 / 검색 디밍 / 인용 농도 recolor — 클릭·토글 시 시뮬레이션 재시작 방지

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
    ├── keywords.js          # extractKeywords, computeLinks (Jaccard)
    └── db.js                # IndexedDB: savePaper/markRead/toggleSota/카테고리
```

## 검증 완료 (2026-06-28)

- 빌드 정상 (597 모듈), oxlint 통과
- **3-tier SOTA 동작 (cs.CV, 브라우저 확인)**: SAM 2 = 금색 `SOTA · MOSE`(현재), Segment Anything·SDXL = 회청 점선 `former SOTA`(과거), Vision Mamba = 파랑 `고인용 397`(폴백) — 콘솔 오류 없음
- **Night Owl 테마 토글**: Night(다크) ↔ Noon(라이트) 즉시 전환, tier 색/강조색 정상 적응
- **자유 키워드 검색**: `surgical` 입력 → 수술 논문 20건(Surgical-VQA/SurgiPose/CholecTrack20…), 칩도 수술 도메인으로 갱신
- **인용 농도 모드**: 고인용 고전 논문 진한 주황 vs 최신 논문 옅은 색으로 명확히 구분
- **키워드 칩 필터(AND/OR)**: 칩 클릭 시 그래프 디밍 + 목록 좁힘 동작
- (이전) arXiv 메타데이터 보강으로 OpenAlex 오라벨링("Micrograph segmentations…" → "Segment Anything") 해결

## TODO (다음에)

- [ ] GitHub Pages 배포 (`npm run deploy`, gh-pages 설치됨)
- [ ] IEEE API 키 발급(developer.ieee.org) 후 end-to-end 검증
- [ ] cs.LG 등 다른 분야에서 tier 분류 확인
- [ ] PwC 덤프 2025 중반 고정 → 이후 논문은 폴백만. 주기적 `build:sota` 또는 신규 리더보드 소스 검토
- [ ] (원래 기획) Chrome 확장: 현재 arXiv 논문 담기

## 실행

```bash
npm run dev        # http://localhost:5173/research-graph/
npm run build
npm run build:sota # PwC 덤프 → src/data/sota-index.json 재생성 (선택, 결과는 커밋됨)
npm run deploy     # GitHub Pages
```

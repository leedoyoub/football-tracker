# Football Tracker v2.5.10 Implementation Plan

**Goal:** 경기 표시, 조회 범위, 과거 선수, 새 경기 선발 및 저장 결과의 일관성을 보수하고 검증 후 main과 Pages에 릴리스한다.

**Architecture:** 기존 timeline, playerMatchFacts, positionScope, canonical ranking, repository/queue를 재사용한다. 화면 표시용 복원은 공식 계산 및 저장 원본과 분리한다.

**Tech Stack:** React 19 / TypeScript / Vite / Node test runner.

**Spec:** 사용자가 첨부한 Football Tracker v2.5.10 전체 정확성·안정성 개선 및 성능 최적화 요청서 (2026-10-16).

## Global Constraints

- 기준 main `964922fe647b136096bd5646bd9462ce665c06a9`, v2.5.9, clean working tree.
- REV13, 공식 통계·수상·대회 판정, 90분 공식 시간, Positions Played 정규화와 10%, 저장 키·스키마·DB·450ms Draft 유지.
- 사용자 데이터 migration 없음. 재현된 오류만 수정. 테스트 삭제·약화 없음.
- 사용자가 구현·검증·독립 리뷰·commit/push/Pages까지 명시적으로 승인한 순서에 따라 진행.

## Review Focus

- 세부 전술 포지션과 정규화 계산을 혼동하지 않는지, 같은 분의 교체/변경 순서를 보존하는지.
- No Team은 현재 멤버십이며 시즌은 과거 경기와 교집합인지.
- 미등록 과거 ID가 표시 과정에서 공식 선수 객체로 추가되지 않는지.
- 일반 저장, Draft, Import, 인증 복원 사이 최신 상태와 실패 재시도가 보존되는지.
- 새 경기 자동 배정이 과거 경기·Draft를 건드리지 않는지.

## A: 포지션과 조회 범위

- [x] PlayerDetail MatchRow 및 RatingDetails 재현 검사 → 공식 이벤트 함수, 상세 전술 표시 projection 연결.
- [x] Players 시즌/팀/복수/No Team/무출전 범위 검사 → 기존 appearance index와 positionScope 재사용, 빠른 검색 유지.
- [x] Comparison 모든 대회·팀·이적·빈 시즌을 canonical 순위와 비교; 정상인 계산 유지.
- [x] Team/Match/Best XI/legacy production 호출 감사; 실제 오류만 회귀 검사 후 수정.

## B: 과거 선수와 새 선발

- [x] MatchDetail/Pitch/Timeline의 누락 ID를 재현하고 표시 전용 fallback 제공; editorRestore/integrity의 실제 손상 검사는 유지.
- [x] 최근 선발 보존, 전역 적합도 배정, GK 제약, 11/12/23 및 Available Squad 검사 후 최소 구현.
- [x] 원본 불변성 및 Draft 복원 검증.

## C: 저장 내구성

- [x] quota/접근 예외/mirror 실패 및 일반 수정/Draft 경쟁 재현.
- [x] updater 부작용 제거, primary 검증 이후 성공, 실패 UI와 재시도, 최신 snapshot/queue 순서 보호.
- [x] Import rollback/Cloud 비활성·실패/연속 변경/종료 경계 회귀 검사.

## D: 성능과 릴리스

- [x] 기존 963개 기준 검사 및 v2.5.9 독립 archive와 도메인 결과 동등성 검사.
- [x] 동일 fixture 반복 cold/revisit Node CPU, Home/Ranking/Results/Log Match/Players, 번들 비교. 측정 증거가 있는 최적화만 반영.
- [x] 독립 리뷰 및 지적 재현/수정, 전체 test/lint/build/diff 검사.
- [x] 2.5.10 버전·assertion·릴리스 보고서 작성 후 최종 검사.
- [ ] commit, non-force main push, Actions/Pages 결과 확인, 가능하면 배포 버전 검사 및 clean tree 보고.

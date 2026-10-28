# Aptiva Project Overview

## Problem

Students have abundant practice material but no way to decide how to spend limited time. They lack:
- An assessment-specific target level
- The cause of lost marks
- Visibility of speed
- A plan that fits days (not weeks)
- A view of how current a test pattern is

## Solution

A planning layer above question banks that combines:
- Student's measured ability (accuracy, speed, error causes)
- Target assessment's blueprint
- Time available

Then produces a time-boxed daily plan that recomputes after every session.

## Users

- Primary: Final-year engineering students
- Secondary: Pre-final-year students, off-campus aspirants
- Internal: Content admins and reviewers

## Core Objectives

1. Per-topic Readiness Gap with sources and confidence
2. Time-boxed plan maximising expected gain per minute
3. Error-cause and speed diagnosis
4. Adaptive re-planning
5. Pilot-measured impact

## Differentiator

The combination of:
- Assessment-specific target
- Time-boxed optimisation
- Error-cause diagnosis
- Speed readiness

Not the size of the question bank.

## Role of ML

Classical statistical estimation and rules:
- Elo/Glicko-2 with uncertainty
- EMA (Exponential Moving Average)
- Rule-based error inference
- Priority scoring
- Knapsack planning

No trained model is needed for the MVP.

## Deliverables

- Student web app (responsive, PWA-ready)
- Admin console
- Reviewed question bank (target 400–600 items)
- 8–10 assessment blueprints with provenance
- Deployed system with CI/CD
- Documentation set
- Pilot evaluation

*See the full Implementation Guide for detailed requirements.*

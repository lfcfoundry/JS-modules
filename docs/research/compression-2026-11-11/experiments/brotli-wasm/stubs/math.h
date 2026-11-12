/* Copyright (c) 2026 LFC Foundry. MIT License. */
#ifndef BR_STUB_MATH_H
#define BR_STUB_MATH_H
double br_log2(double x);
#define log2(x) br_log2(x)
#define HUGE_VAL __builtin_huge_val()
#endif

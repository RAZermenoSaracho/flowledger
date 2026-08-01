import type { ReportFilters } from "@flowledger/shared";
import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import {
  getByCategoryReport,
  getMonthlyCashflowReport,
  getSummaryReport
} from "../services/read.service.js";

export async function getSummary(req: Request, res: Response) {
  const filters = req.query as ReportFilters;
  const result = await getSummaryReport(req.user!.id, filters);
  res.json(result);
}

export async function getByCategory(req: Request, res: Response) {
  const filters = req.query as ReportFilters;
  const result = await getByCategoryReport(req.user!.id, filters);
  res.json(result);
}

export async function getMonthlyCashflow(req: Request, res: Response) {
  const filters = req.query as ReportFilters;
  const result = await getMonthlyCashflowReport(req.user!.id, filters);
  res.json({ cashflow: serialize(result.cashflow), currency: result.currency });
}

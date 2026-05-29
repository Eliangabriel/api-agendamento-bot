// server.js
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const yaml = require("js-yaml");

const app = express();
app.use(express.json());

// Carrega o openapi.yaml e serve no /api-docs
// Adicionamos um try-catch para não quebrar caso o yaml não exista no primeiro teste
try {
  const swaggerDocument = yaml.load(fs.readFileSync("./openapi.yaml", "utf8"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
  console.log("openapi.yaml não encontrado, pulando o Swagger por enquanto.");
}

// ─── Banco de dados em memória ───
const bookings = {}; 
const MAX_PER_SLOT = 3;
const PERIODS = ["manha", "tarde", "dia_todo"];

function getD3Dates(qty = 7) {
  const dates = [];
  for (let i = 3; i < 3 + qty; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function getCount(date, period) {
  return bookings[date]?.[period] ?? 0;
}

function incrementSlot(date, period) {
  if (!bookings[date]) bookings[date] = {};
  if (!bookings[date][period]) bookings[date][period] = 0;
  bookings[date][period]++;
}

// ─── ROTAS ───
app.get("/slots", (req, res) => {
  const periodLabels = { manha: "Manhã", tarde: "Tarde", dia_todo: "Dia todo" };
  const dates = getD3Dates();

  const slots = dates
    .map((date) => {
      const d = new Date(date + "T12:00:00");
      const label = d.toLocaleDateString("pt-BR", { weekday: "long" });
      const periods = {};

      PERIODS.forEach((p) => {
        const booked = getCount(date, p);
        periods[p] = { label: periodLabels[p], booked, available: booked < MAX_PER_SLOT };
      });

      return { date, label, periods };
    })
    .filter((slot) => PERIODS.some((p) => slot.periods[p].available));

  res.json({ slots });
});

app.post("/slots/book", (req, res) => {
  const { date, period, contact_id } = req.body;

  if (!date || !period || !contact_id) return res.status(422).json({ success: false, error: "MISSING_FIELDS", message: "Campos obrigatórios: date, period, contact_id" });
  if (!PERIODS.includes(period)) return res.status(422).json({ success: false, error: "INVALID_PERIOD", message: "Período deve ser: manha, tarde ou dia_todo" });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + 3);
  const reqDate = new Date(date + "T00:00:00");

  if (reqDate < minDate) return res.status(422).json({ success: false, error: "INVALID_DATE", message: "Data deve ser D+3 ou superior" });

  const current = getCount(date, period);
  if (current >= MAX_PER_SLOT) return res.status(409).json({ success: false, error: "SLOT_FULL", message: "Limite atingido" });

  incrementSlot(date, period);
  const booking_id = "bk_" + Math.random().toString(36).slice(2, 9);

  res.status(201).json({ success: true, booking_id, date, period });
});

app.get("/slots/availability/:date", (req, res) => {
  const { date } = req.params;
  const d3Dates = getD3Dates(30);

  if (!d3Dates.includes(date)) return res.status(404).json({ success: false, error: "DATE_NOT_FOUND", message: "Data inválida" });

  const periods = {};
  PERIODS.forEach((p) => {
    const booked = getCount(date, p);
    periods[p] = { booked, remaining: MAX_PER_SLOT - booked, available: booked < MAX_PER_SLOT };
  });

  res.json({ date, periods });
});

// ─── START (Ajustado para Nuvem) ───
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

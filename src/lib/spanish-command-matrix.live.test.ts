import { describe, expect, it } from "vitest";
import { processMessage, type AIResult } from "./ai-processor";

type Intent = AIResult["intent"];
type SpanishCase = { message: string; intents: Intent[] };

const one = (intent: Intent, messages: string[]): SpanishCase[] =>
  messages.map(message => ({ message, intents: [intent] }));

/**
 * Matriz operacional em espanhol. Fica fora da suíte comum porque consulta o
 * mesmo Gemini usado em produção. Execute com LIVE_SPANISH_MATRIX=1.
 */
export const SPANISH_COMMAND_MATRIX: Record<string, SpanishCase[]> = {
  finanzas: [
    ...one("finance_register", ["Gasté 50 dólares en el supermercado", "Recibí 1200 dólares del cliente Ana"]),
    { message: "¿Cuánto gasté la semana pasada?", intents: ["finance_query", "finance_analysis"] },
    { message: "¿Cuál es mi saldo personal?", intents: ["balance_query", "finance_query"] },
    { message: "¿Qué tengo que pagar la semana que viene?", intents: ["finance_upcoming", "weekly_summary"] },
    ...one("finance_edit", ["Cambia el gasto de farmacia de ayer a 65 dólares"]),
    ...one("finance_delete", ["Elimina el gasto de taxi de hoy"]),
    ...one("finance_detail", ["Muéstrame los detalles de la compra de libros"]),
    ...one("finance_analysis", ["Analiza mis gastos de los últimos 30 días"]),
    ...one("weekly_summary", ["Dame el resumen de la semana que viene"]),
  ],
  tareas: [
    ...one("task_create", ["Crea una tarea para llamar al contador mañana"]),
    // Com horário exato, o produto cria um aviso que realmente dispara.
    { message: "Añade la tarea enviar el presupuesto hoy a las 16:00", intents: ["reminder_set"] },
    ...one("task_create", ["Tengo que revisar el contrato el viernes", "Crea tres tareas: llamar a Ana, pagar internet y revisar el coche"]),
    ...one("task_query", ["Muéstrame mis tareas", "¿Qué tareas tengo para hoy?"]),
    ...one("task_update", ["Marca la tarea 2 como terminada", "Cambia la tarea reunión al lunes", "Pon la tarea informe como prioridad alta"]),
    ...one("task_delete", ["Elimina la tarea comprar tinta"]),
  ],
  recordatorios: [
    ...one("reminder_set", [
      "Recuérdame pagar la luz mañana a las 9",
      "Avísame todos los días a las 8 para tomar agua",
      "Recuérdale a Carlos la reunión el viernes a las 14",
      "Programa un recordatorio mensual para pagar el alquiler",
    ]),
    ...one("reminder_list", ["Muéstrame mis recordatorios", "¿Qué avisos tengo para mañana?"]),
    ...one("reminder_update", ["Cambia el recordatorio de la luz a las 10", "Modifica el aviso del alquiler para el día 5"]),
    ...one("reminder_delete", ["Elimina el recordatorio de tomar agua", "Borra todos los recordatorios de mañana"]),
  ],
  vehiculos: [
    ...one("vehicle_create", ["Registra mi coche Toyota Corolla 2022 matrícula ABC1D23", "Añade un camión Volvo FH 2021 a la empresa"]),
    ...one("vehicle_query", ["Muéstrame mis vehículos", "¿Cuánto gasté con el Corolla?", "Consulta el kilometraje de mi coche"]),
    ...one("vehicle_expense", ["Gasté 70 en gasolina para el Corolla", "Registra mantenimiento de 300 dólares en el camión"]),
    ...one("vehicle_update", ["Cambia el kilometraje del Corolla a 45000", "Pasa el camión a la cuenta empresarial"]),
    ...one("vehicle_delete", ["Elimina el vehículo de matrícula ABC1D23"]),
  ],
  supermercado: [
    ...one("grocery_list_add", ["Añade leche, pan y huevos a mi lista", "Pon dos kilos de arroz en la lista"]),
    ...one("grocery_list_show", ["Muéstrame mi lista de compras"]),
    { message: "¿Tengo café en mi lista?", intents: ["grocery_list_show", "grocery_list_check"] },
    ...one("grocery_list_edit", ["Cambia la cantidad de leche a 3 unidades"]),
    ...one("grocery_list_remove", ["Quita el pan y los huevos de la lista"]),
    ...one("grocery_list_clear", ["Limpia toda mi lista de compras"]),
    ...one("grocery_last_purchase_query", ["¿Qué compré la última vez en Muffato?"]),
    ...one("grocery_spend_query", ["¿Cuánto gasté en mis compras de supermercado este mes?"]),
    ...one("grocery_history_query", ["Muéstrame todas mis compras en Muffato"]),
  ],
  supermercado_avanzado: [
    ...one("grocery_purchase", [
      "Registra mi compra en Muffato: leche 3 dólares, pan 2 dólares y huevos 5 dólares",
      "Compré arroz por 8 dólares y frijoles por 6 dólares en Disco",
    ]),
    ...one("grocery_purchase_finish", [
      "Terminé la compra en Tienda Inglesa y gasté 85 dólares",
      "Finaliza la compra con los productos marcados de mi lista",
    ]),
    ...one("grocery_list_generate", [
      "Crea una lista básica de frutas y verduras",
      "Sugiere una lista completa para el supermercado",
    ]),
    ...one("grocery_price_compare", [
      "¿Dónde pagué más barato por la leche?",
      "Compara el precio del arroz entre los supermercados donde compré",
    ]),
    ...one("grocery_store_ranking", [
      "¿Cuál es el supermercado más barato para mí?",
      "Muéstrame el ranking de los supermercados donde compro",
    ]),
  ],
  metas: [
    ...one("goal_create", ["Crea una meta de ahorrar 5000 dólares hasta diciembre", "Quiero juntar 2000 para un viaje"]),
    ...one("goal_query", ["Muéstrame mis metas", "¿Cómo va mi meta del viaje?"]),
    ...one("goal_add", ["Añade 200 dólares a la meta del viaje", "Suma 50 a mi meta de emergencia"]),
    ...one("goal_complete", ["Marca la meta del viaje como completada", "Completa la meta número 2"]),
    ...one("goal_cancel", ["Cancela la meta de comprar un coche", "Elimina la meta de emergencia"]),
  ],
  agenda: [
    ...one("meet_create", ["Agenda una reunión con Ana mañana a las 15"]),
    ...one("agenda_create", ["Crea una cita médica el viernes a las 9"]),
    ...one("agenda_list", ["Muéstrame mi agenda de hoy", "¿Qué reuniones tengo la semana que viene?"]),
    ...one("agenda_update", ["Cambia la reunión con Ana a las 16", "Mueve la cita médica al lunes"]),
    ...one("agenda_delete", ["Cancela la reunión con Ana"]),
    ...one("agenda_done", ["Marca la cita médica como realizada"]),
    ...one("agenda_add_meet", ["Añade Google Meet a la reunión con Ana"]),
    ...one("meet_create", ["Crea una reunión por Google Meet mañana a las 10 con ana@ejemplo.com"]),
  ],
  recurrentes: [
    ...one("recurring_create", ["Registra el alquiler de 800 dólares todos los meses", "Crea una cuota mensual de 120 por seis meses"]),
    ...one("recurring_query", ["Muéstrame mis pagos recurrentes", "¿Qué cuotas vencen este mes?", "Consulta la suscripción de internet"]),
    ...one("recurring_edit", ["Cambia el alquiler recurrente a 850", "Mueve la cuota del coche al día 10", "Edita la suscripción de internet"]),
    ...one("recurring_cancel", ["Cancela la suscripción de internet", "Elimina el pago recurrente del gimnasio"]),
  ],
  empleados: [
    ...one("employee_create", ["Registra al empleado Carlos con salario de 1500", "Añade a María como vendedora"]),
    ...one("employee_list", ["Muéstrame mis empleados", "Lista todos los funcionarios de la empresa"]),
    ...one("employee_update", ["Cambia el salario de Carlos a 1700", "Actualiza el cargo de María a gerente", "Modifica el teléfono del empleado Carlos"]),
    ...one("employee_deactivate", ["Desactiva al empleado Carlos", "Elimina a María del equipo"]),
    ...one("employee_list", ["¿Cuántos empleados activos tengo?"]),
  ],
  clientes: [
    ...one("customer_create", ["Registra al cliente Juan con teléfono 56912345678", "Añade la empresa Sol como cliente"]),
    ...one("customer_list", ["Muéstrame mis clientes", "Lista todos los clientes activos"]),
    ...one("customer_query", ["Busca al cliente Juan", "Muéstrame los datos de la empresa Sol"]),
    ...one("customer_update", ["Cambia el teléfono del cliente Juan", "Actualiza el correo de la empresa Sol"]),
    ...one("customer_deactivate", ["Desactiva al cliente Juan", "Elimina la empresa Sol de mis clientes"]),
  ],
  drive: [
    ...one("drive_search", [
      "Busca mi contrato de alquiler en Drive",
      "Encuentra la factura de internet",
      "Muéstrame el último comprobante guardado",
      "Busca los archivos de septiembre",
      "Encuentra el PDF del cliente Juan",
    ]),
    ...one("drive_rename", [
      "Renombra el último archivo como contrato firmado",
      "Cambia el nombre de la factura a internet septiembre",
      "Pon al comprobante el nombre pago alquiler",
      "Renombra mi último PDF",
      "Cambia el nombre del archivo del cliente Juan",
    ]),
  ],
  investigacion_web: one("web_search", [
    "Busca el precio del dólar hoy",
    "¿Va a llover esta semana en Santiago de Chile?",
    "Busca vuelos de Montevideo a Buenos Aires para mañana",
    "Consulta el precio de paracetamol en Ciudad de México",
    "¿Cómo está el clima allí?",
    "Busca restaurantes abiertos ahora en Medellín",
    "Consulta los horarios de autobús de Córdoba a Rosario",
    "Busca el precio del iPhone más reciente en Uruguay",
    "¿Qué eventos hay hoy en Lima?",
    "Investiga las noticias económicas de Chile de hoy",
  ]),
  finanzas_avanzadas: [
    ...one("daily_summary", ["Dame el resumen de hoy", "Muéstrame el resumen de mañana"]),
    ...one("finance_confirm_pending", [
      "Ya pagué la factura de electricidad que estaba pendiente",
      "Confirma el cobro del alquiler que estaba programado",
    ]),
    ...one("category_create", [
      "Crea la categoría Mascotas para mis gastos",
      "Crea las categorías Consultoría y Bonificaciones para mis ingresos",
    ]),
    ...one("finance_clear_history", [
      "Borra todo mi historial financiero personal",
      "Elimina todos los ingresos y gastos de la empresa",
    ]),
    ...one("finance_register", [
      "Registra dos movimientos: gasté 20 en taxi y recibí 300 de una venta",
      "Anota 500 dólares por cobrar del cliente Carlos para el viernes",
    ]),
  ],
  controles_sistema: [
    ...one("mode_switch", [
      "Cambia al modo personal",
      "Pasa a la cuenta empresarial",
      "Quiero usar el modo empresa",
    ]),
    ...one("how_to", [
      "¿Cómo registro un gasto?",
      "¿Cómo conecto mi Google Calendar?",
      "Explícame cómo agregar un vehículo",
      "¿Cómo elimino una tarea?",
    ]),
    ...one("help", ["Ayuda", "¿Qué puedes hacer?", "Muéstrame todos los comandos disponibles"]),
  ],
};

const USER_FACING_INTENTS: Intent[] = [
  "finance_register", "finance_query", "finance_upcoming", "finance_edit", "finance_delete",
  "finance_analysis", "daily_summary", "weekly_summary", "task_create", "task_update", "task_query",
  "task_delete", "reminder_set", "reminder_list", "reminder_update", "reminder_delete", "mode_switch",
  "balance_query", "goal_create", "goal_add", "goal_query", "goal_complete", "goal_cancel", "vehicle_create",
  "vehicle_update", "vehicle_delete", "vehicle_expense", "vehicle_query", "recurring_create", "recurring_query",
  "recurring_cancel", "recurring_edit", "drive_search", "drive_rename", "agenda_create", "agenda_list",
  "agenda_update", "agenda_delete", "agenda_add_meet", "agenda_done", "meet_create", "finance_detail",
  "finance_confirm_pending", "grocery_list_add", "grocery_list_show", "grocery_list_check", "grocery_list_clear",
  "grocery_list_remove", "grocery_list_edit", "grocery_purchase", "grocery_purchase_finish", "grocery_list_generate",
  "grocery_price_compare", "grocery_store_ranking", "grocery_history_query", "grocery_last_purchase_query",
  "grocery_spend_query", "employee_create", "employee_list", "employee_update", "employee_deactivate",
  "customer_create", "customer_list", "customer_query", "customer_update", "customer_deactivate", "web_search",
  "how_to", "help", "category_create", "finance_clear_history",
];

const liveDescribe = process.env.LIVE_SPANISH_MATRIX === "1" ? describe : describe.skip;

describe("Spanish command matrix definition", () => {
  it("contains exactly ten different commands per module", () => {
    for (const cases of Object.values(SPANISH_COMMAND_MATRIX)) {
      expect(cases).toHaveLength(10);
      expect(new Set(cases.map(item => item.message.toLocaleLowerCase("es"))).size).toBe(10);
    }
  });

  it("covers every user-facing intent available in Portuguese", () => {
    const covered = new Set(Object.values(SPANISH_COMMAND_MATRIX).flatMap(cases => cases.flatMap(item => item.intents)));
    expect(USER_FACING_INTENTS.filter(intent => !covered.has(intent))).toEqual([]);
  });
});

liveDescribe("Spanish production command interpretation", () => {
  const selectedModule = process.env.SPANISH_MATRIX_MODULE;
  const modes = process.env.SPANISH_MATRIX_BOTH_MODES === "1"
    ? (["personal", "business"] as const)
    : (["personal"] as const);
  for (const [module, cases] of Object.entries(SPANISH_COMMAND_MATRIX).filter(([name]) => !selectedModule || name === selectedModule)) {
    it(module, async () => {
      const failures: string[] = [];
      for (const activeMode of modes) {
        for (const sample of cases) {
          const result = await processMessage(sample.message, {
            user: {
              locale: "es",
              activeMode,
              customCategoriesExpense: [],
              customCategoriesIncome: [],
            },
          });
          if (!sample.intents.includes(result.intent)) {
            failures.push(`[${activeMode}] ${sample.message} => ${result.intent}; esperaba ${sample.intents.join("/")}`);
          }
        }
      }
      expect(failures, failures.join("\n")).toEqual([]);
    }, 180_000);
  }
});

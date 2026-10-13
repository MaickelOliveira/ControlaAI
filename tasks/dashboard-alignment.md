# Dashboard content alignment

The long planning rail and paired cash/credit panels created empty areas when one bank or a selected card had much more content than its neighbor. The overview and wallet now use the full content width. Planning cards have their own row, and the financial analysis remains visible below. Cash and credit panels are stacked with compact internal columns rather than stretching the shorter panel to match the other.

Card selection, all rendered limits, bill links, filters and financial calculations are preserved. The wallet detail panel is scrollable and keyboard focusable; small screens use one column. Configurações uses a local Google Calendar logo from Google's public product asset, https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png, without changing Google authorization.

Validation: production build/types passed; lint has no errors and two existing warnings. Independent review found no required issues, and 19 focused wallet/credit tests passed. The local preview uses fictitious API responses and no production environment. Desktop and 390px mobile layouts, light/dark presentation, financial-analysis visibility and horizontal overflow were checked.

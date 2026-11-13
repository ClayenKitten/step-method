<script lang="ts">
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { satisfactionPercent, type Constraint, type Objective } from '#lib/stem.js';
	import {
		accept,
		concede,
		currentIteration,
		emptySession,
		mostSatisfiedActive,
		startSession,
		stepBack,
		type StemSession
	} from '#lib/stem-session.js';
	import { emptyTask, inferNumVars, parseTaskParams, serializeTaskParams } from '#lib/task-url.js';
	import { taskPresets, type TaskPreset } from '#lib/task-presets.js';
	import { fmt, formatLinear, senseSymbol, varLabel } from '#lib/format.js';

	// ---------------------------------------------------------------------------
	// Problem definition (editable form), pre-filled from the URL query.
	// The query is read on the client only: a prerendered page has no query
	// string, so the server renders the empty form and hydration applies the
	// parameters from the real address.
	// ---------------------------------------------------------------------------
	const parsed = browser ? parseTaskParams(window.location.search) : { task: null, invalid: false };
	const initial = parsed.task ?? emptyTask();

	let numVars = $state(initial.numVars);
	let objectives = $state<Objective[]>(initial.objectives);
	let constraints = $state<Constraint[]>(initial.constraints);
	let varNames = $state<string[]>(initial.varNames);
	let warning = $state<string | null>(
		parsed.invalid ? 'Не удалось разобрать задачу из ссылки.' : null
	);

	/** Description of the chosen preset, shown under the preset buttons. */
	let presetDescription = $state<string[] | null>(null);

	// ---------------------------------------------------------------------------
	// Session state; the STEM flow itself lives in #lib/stem-session.js
	// ---------------------------------------------------------------------------
	let session = $state<StemSession>(emptySession());

	// Concession controls for the current iteration.
	let relaxChoice = $state(0);
	let relaxAmount = $state(0);

	const current = $derived(currentIteration(session));
	const locked = $derived(session.phase === 'results');
	const problem = $derived(session.problem);
	const payoff = $derived(session.payoff);
	const iterations = $derived(session.iterations);
	const activeObjectives = $derived(session.activeObjectives);
	const accepted = $derived(session.accepted);
	const error = $derived(session.error);

	/** Active criterion closest to its ideal, with its satisfaction percentage. */
	const suggestion = $derived.by(() => {
		if (!current || activeObjectives.length <= 1) return null;
		return mostSatisfiedActive(session);
	});

	/** Bound the relaxed criterion will be held to, in its own units. */
	const relaxPreview = $derived(relaxBoundPreview());

	// Keep the URL in sync with the problem definition so any state of the
	// form can be shared by copying the link. The first run right after the
	// prefill is skipped: the URL should only change once the user edits
	// something. Solution progress is intentionally not reflected in the URL.
	let urlSyncStarted = false;
	$effect(() => {
		const query = serializeTaskParams({ varNames, objectives, constraints });
		if (!urlSyncStarted) {
			urlSyncStarted = true;
			return;
		}
		// untrack keeps `page.url` out of the dependencies; otherwise the
		// replaceState below would re-trigger this effect forever.
		untrack(() => {
			replaceState(`${page.url.pathname}?${query}`, {});
		});
	});

	// ---------------------------------------------------------------------------
	// Form helpers
	// ---------------------------------------------------------------------------
	function resizeVars() {
		// The raw input allows out-of-range or fractional values; clamp them.
		numVars = Math.max(1, Math.min(8, Math.trunc(Number(numVars) || 1)));
		while (varNames.length < numVars) varNames.push('');
		varNames.length = numVars;
		for (const objective of objectives) {
			while (objective.coeffs.length < numVars) objective.coeffs.push(0);
			objective.coeffs.length = numVars;
		}
		for (const constraint of constraints) {
			while (constraint.coeffs.length < numVars) constraint.coeffs.push(0);
			constraint.coeffs.length = numVars;
		}
	}

	function addObjective() {
		objectives.push({
			name: `z${objectives.length + 1}`,
			sense: 'max',
			coeffs: Array.from({ length: numVars }, () => 0)
		});
	}

	function removeObjective(index: number) {
		if (objectives.length <= 1) return;
		objectives.splice(index, 1);
	}

	function addConstraint() {
		constraints.push({
			coeffs: Array.from({ length: numVars }, () => 0),
			sense: '<=',
			rhs: 0
		});
	}

	function removeConstraint(index: number) {
		constraints.splice(index, 1);
	}

	/** Load a preset into the form and show its description. */
	function applyPreset(preset: TaskPreset) {
		objectives = preset.task.objectives.map((objective) => ({
			...objective,
			coeffs: [...objective.coeffs]
		}));
		constraints = preset.task.constraints.map((constraint) => ({
			...constraint,
			coeffs: [...constraint.coeffs]
		}));
		varNames = [...preset.task.varNames];
		numVars = inferNumVars(preset.task);
		presetDescription = preset.description;
		warning = null;
	}

	// ---------------------------------------------------------------------------
	// STEM flow (delegates to #lib/stem-session.js)
	// ---------------------------------------------------------------------------
	function handleSolve() {
		session = startSession({ objectives, constraints });
		warning = null;
		relaxChoice = session.activeObjectives[0] ?? 0;
		relaxAmount = 0;
	}

	function handleNext() {
		const iterationsBefore = session.iterations.length;
		session = concede(session, relaxChoice, relaxAmount);
		if (session.iterations.length > iterationsBefore) {
			relaxChoice = session.activeObjectives[0] ?? 0;
			relaxAmount = 0;
		}
	}

	function handleBack() {
		session = stepBack(session);
		relaxChoice = session.activeObjectives[0] ?? 0;
		relaxAmount = 0;
	}

	function handleReset() {
		session = emptySession();
		warning = null;
		presetDescription = null;
	}

	function handleAccept() {
		session = accept(session);
	}

	function objectiveLabel(index: number): string {
		const name = problem?.objectives[index]?.name?.trim();
		return name ? name : `z${index + 1}`;
	}

	/** Criterion i's closeness to its ideal, in percent (0–100). */
	function satisfaction(i: number, value: number): number {
		return payoff ? satisfactionPercent(payoff.ideal[i], payoff.worst[i], value) : 0;
	}

	/**
	 * Bound that the relaxed criterion will be held to after the concession,
	 * in its own units (the concession is measured from the current value).
	 */
	function relaxBoundPreview(): number | null {
		if (!problem || !current || !relaxAmount || relaxAmount < 0) return null;
		const now = current.z[relaxChoice];
		return problem.objectives[relaxChoice].sense === 'max' ? now - relaxAmount : now + relaxAmount;
	}
</script>

<p class="back"><a href={resolve('/')}>← К описанию метода</a></p>

<h1>Решение задачи методом STEM</h1>

{#if warning}
	<div class="warning">
		<span>{warning}</span>
		<button class="dismiss" onclick={() => (warning = null)} aria-label="Скрыть предупреждение">
			×
		</button>
	</div>
{/if}

<section>
	<h2>1. Постановка задачи</h2>

	<div class="presets">
		<div class="presets-row">
			<span class="presets-label">Готовые примеры:</span>
			{#each taskPresets as preset}
				<button onclick={() => applyPreset(preset)} disabled={locked}>
					{preset.title}
				</button>
			{/each}
		</div>
		{#if presetDescription}
			<div class="presets-description">
				{#each presetDescription as paragraph}
					<p>{paragraph}</p>
				{/each}
			</div>
		{/if}
	</div>

	<p>
		<label>
			Количество переменных:
			<input
				type="number"
				min="1"
				max="8"
				bind:value={numVars}
				onchange={resizeVars}
				disabled={locked}
			/>
		</label>
	</p>

	<h3>Целевые функции</h3>
	<table>
		<thead>
			<tr>
				<th>Название</th>
				<th>Цель</th>
				{#each Array(numVars) as _, j}
					<th>
						<input bind:value={varNames[j]} placeholder="x{j + 1}" disabled={locked} />
					</th>
				{/each}
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each objectives as objective, i}
				<tr>
					<td><input bind:value={objective.name} placeholder="z{i + 1}" disabled={locked} /></td>
					<td>
						<select bind:value={objective.sense} disabled={locked}>
							<option value="max">max</option>
							<option value="min">min</option>
						</select>
					</td>
					{#each Array(numVars) as _, j}
						<td><input type="number" bind:value={objective.coeffs[j]} disabled={locked} /></td>
					{/each}
					<td>
						<button onclick={() => removeObjective(i)} disabled={locked || objectives.length <= 1}>
							удалить
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<button onclick={addObjective} disabled={locked}>Добавить критерий</button>

	<h3>Ограничения</h3>
	<table>
		<thead>
			<tr>
				{#each Array(numVars) as _, j}
					<th>{varLabel(j, varNames)}</th>
				{/each}
				<th></th>
				<th>Значение</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each constraints as constraint, i}
				<tr>
					{#each Array(numVars) as _, j}
						<td><input type="number" bind:value={constraint.coeffs[j]} disabled={locked} /></td>
					{/each}
					<td>
						<select bind:value={constraint.sense} disabled={locked}>
							<option value="<=">&le;</option>
							<option value=">=">&ge;</option>
							<option value="=">=</option>
						</select>
					</td>
					<td><input type="number" bind:value={constraint.rhs} disabled={locked} /></td>
					<td><button onclick={() => removeConstraint(i)} disabled={locked}>удалить</button></td>
				</tr>
			{/each}
		</tbody>
	</table>
	<button onclick={addConstraint} disabled={locked}>Добавить ограничение</button>

	<h3>Итоговая постановка</h3>
	<div class="equations">
		{#each objectives as objective}
			<div>
				{objective.sense === 'max' ? 'max' : 'min'}
				{objective.name} = {formatLinear(objective.coeffs, varNames)}
			</div>
		{/each}
		<div>при ограничениях:</div>
		{#each constraints as constraint}
			<div>
				{formatLinear(constraint.coeffs, varNames)}
				{senseSymbol(constraint.sense)}
				{constraint.rhs}
			</div>
		{/each}
		<div>{Array.from({ length: numVars }, (_, j) => varLabel(j, varNames)).join(', ')} ≥ 0</div>
	</div>

	<p>
		<button onclick={handleSolve} disabled={locked}>Решить</button>
		{#if locked}
			<button onclick={handleReset}>Изменить задачу</button>
		{/if}
	</p>

	{#if error}
		<p class="error">{error}</p>
	{/if}
</section>

{#if locked && problem && payoff}
	<section>
		<h2>2. Таблица значений критериев</h2>
		<p>
			Каждый критерий оптимизируется по отдельности. В таблице приведены значения всех критериев в
			точках оптимума, найденных для каждого критерия.
		</p>

		<table>
			<thead>
				<tr>
					<th>Критерий</th>
					{#each payoff.solutions as _, j}
						<th>в x<sup>{j + 1}</sup></th>
					{/each}
					<th>Лучшее</th>
					<th>Худшее</th>
					<th>Вес w<sub>i</sub></th>
				</tr>
			</thead>
			<tbody>
				{#each problem.objectives as objective, i}
					<tr>
						<td>{objective.name} ({objective.sense})</td>
						{#each payoff.table[i] as value}
							<td>{fmt(value)}</td>
						{/each}
						<td><strong>{fmt(payoff.ideal[i])}</strong></td>
						<td>{fmt(payoff.worst[i])}</td>
						<td>{fmt(payoff.weights[i])}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<h2>3. Итерации</h2>
		<p>
			На каждом шаге компьютер предлагает конкретный компромиссный план: метод старается приблизить
			все ещё активные критерии к их идеальным значениям, соблюдая ограничения задачи и все уступки,
			сделанные ранее. Ваша задача — посмотреть на предложенный план и решить: принять его или
			пожертвовать одним из критериев, чтобы улучшить остальные.
		</p>

		{#each iterations as iteration, idx}
			<article>
				<h3>Шаг {iteration.index}</h3>

				<div class="solution">
					<h4>Предлагаемое решение</h4>
					<p class="plan">
						{#each iteration.x as value, j}
							<span><strong>{varLabel(j, varNames)}</strong> = {fmt(value)}</span>
						{/each}
					</p>
					<p class="hint">
						Это готовый план: столько единиц каждой переменной предлагается взять. Например, «{varLabel(
							0,
							varNames
						)} = 2, {varLabel(1, varNames)} = 3» читается как «2 единицы первой переменной и 3 единицы
						второй».
					</p>

					<table>
						<thead>
							<tr>
								<th>Критерий</th>
								<th>Получится</th>
								<th>Идеал</th>
								<th>Худшее</th>
								<th>Близость к идеалу</th>
							</tr>
						</thead>
						<tbody>
							{#each problem.objectives as objective, i}
								<tr>
									<td>{objective.name} ({objective.sense})</td>
									<td><strong>{fmt(iteration.z[i])}</strong></td>
									<td>{fmt(payoff.ideal[i])}</td>
									<td>{fmt(payoff.worst[i])}</td>
									<td>{satisfaction(i, iteration.z[i]).toFixed(0)}%</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<p class="hint">
						«Близость к идеалу»: 100% — критерий достиг своего идеального значения из таблицы
						значений критериев, 0% — худшего. Сравнивайте критерии по этой колонке, решая, чем
						готовы пожертвовать.
					</p>
				</div>

				<details class="tech">
					<summary>Технические детали шага (можно пропустить)</summary>
					<p>
						Активные критерии:
						{iteration.activeObjectives.map((i) => objectiveLabel(i)).join(', ') || 'нет'}
						— те, что метод ещё старается приблизить к идеалу; остальные превращены в ограничения.
					</p>
					<p>
						&lambda; = {fmt(iteration.lambda)} — наибольшее взвешенное отклонение активных критериев от
						их идеалов в этом решении (чем меньше, тем лучше). Для выбора решения эта величина не нужна.
					</p>
					{#if iteration.concessions.length}
						<p>
							Сделанные уступки:
							{iteration.concessions
								.map(
									(c) =>
										`${objectiveLabel(c.objective)} может ухудшиться на ${fmt(c.amount)} (не хуже ${fmt(
											c.boundOriginal
										)})`
								)
								.join('; ')}
						</p>
					{/if}
				</details>

				{#if idx === iterations.length - 1}
					<div class="decision">
						{#if accepted}
							<p class="ok">
								<strong>Решение принято.</strong> Компромиссное решение: x = ({iteration.x
									.map((v) => fmt(v))
									.join(', ')}).
							</p>
						{:else}
							<h4>Ваше решение</h4>
							<p>
								Посмотрите на колонку «Близость к идеалу» в таблице шага. Если план устраивает —
								нажмите «Принять это решение». Если какой-то критерий вышел слишком плохим,
								пожертвуйте другим: выберите критерий, который сейчас ближе всего к своему идеалу, и
								разрешите ему ухудшиться. На следующем шаге метод перестанет его улучшать (он
								превратится в ограничение) и направит усилия на оставшиеся критерии.
							</p>
							{#if suggestion}
								<p class="hint">
									Подсказка: ближе всего к своему идеалу сейчас {objectiveLabel(suggestion.index)}
									({suggestion.percent.toFixed(0)}%). Обычно уступают именно по такому критерию.
								</p>
							{/if}
							{#if activeObjectives.length > 1}
								<p>
									<label>
										Ослабляемый критерий:
										<select bind:value={relaxChoice}>
											{#each activeObjectives as i}
												<option value={i}>{objectiveLabel(i)}</option>
											{/each}
										</select>
									</label>
								</p>
								<p>
									<label>
										Величина уступки:
										<input type="number" min="0" step="any" bind:value={relaxAmount} />
									</label>
								</p>
								{#if relaxPreview !== null && current}
									<p class="hint">
										Уступка отсчитывается от текущего значения: {objectiveLabel(relaxChoice)}
										сейчас равен {fmt(current.z[relaxChoice])}; после уступки критерий сможет
										ухудшиться до ≈ {fmt(relaxPreview)}.
									</p>
								{/if}
							{/if}
							<p class="actions">
								<button onclick={handleBack} disabled={iterations.length <= 1}> Назад </button>
								<button onclick={handleNext} disabled={activeObjectives.length <= 1}>
									Следующий шаг
								</button>
								<button class="accept" onclick={handleAccept}> Принять это решение </button>
							</p>
							{#if activeObjectives.length <= 1}
								<p class="hint">
									Остался один активный критерий — уступать больше некому, поэтому «Следующий шаг»
									недоступен: текущее решение окончательное. Можно принять его, вернуться назад или
									изменить задачу.
								</p>
							{/if}
						{/if}
					</div>
				{/if}
			</article>
		{/each}

		<p><button onclick={handleReset}>Изменить задачу</button></p>
	</section>
{/if}

<style>
	.back {
		margin: 0 0 0.75rem;
	}

	.back a {
		color: #1d5fbf;
		text-decoration: none;
		font-size: 0.92rem;
	}

	.back a:hover {
		text-decoration: underline;
	}

	.warning {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0;
		padding: 0.6rem 0.9rem;
		background: #fff7e6;
		border: 1px solid #f0d9a8;
		border-left: 3px solid #e6a23c;
		border-radius: 4px;
		font-size: 0.92rem;
		color: #6b5200;
	}

	.warning .dismiss {
		margin-left: auto;
		padding: 0 0.4rem;
		border: none;
		background: none;
		font-size: 1.1rem;
		line-height: 1;
		color: inherit;
	}

	.warning .dismiss:hover:not(:disabled) {
		background: none;
	}

	.presets {
		margin: 0.75rem 0;
		padding: 0.6rem 0.9rem;
		background: #f0f7ff;
		border: 1px solid #cfe3ff;
		border-left: 3px solid #7aa7ff;
		border-radius: 4px;
	}

	.presets-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}

	.presets-label {
		font-size: 0.92rem;
		font-weight: 600;
		color: #4b5563;
		margin-right: 0.25rem;
	}

	.presets-description {
		margin-top: 0.4rem;
		font-size: 0.9rem;
		color: #4b5563;
	}

	.presets-description p {
		margin: 0.2rem 0;
	}

	article {
		background: #fff;
		border: 1px solid #e2e4e8;
		border-left: 3px solid #7aa7ff;
		border-radius: 4px;
		padding: 0.5rem 1rem;
		margin: 0.75rem 0;
	}

	article p {
		margin: 0.25rem 0;
	}

	.decision {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: #f6f7f9;
		border: 1px solid #e2e4e8;
		border-radius: 4px;
	}

	.decision h4 {
		margin: 0 0 0.25rem;
		font-size: 0.95rem;
	}

	.solution {
		background: #f0f7ff;
		border: 1px solid #cfe3ff;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin: 0.5rem 0;
	}

	.solution h4 {
		margin: 0 0 0.25rem;
		font-size: 0.95rem;
	}

	.plan {
		font-size: 1.05rem;
	}

	.plan span {
		display: inline-block;
		margin-right: 0.9rem;
	}

	.actions {
		display: flex;
		align-items: center;
	}

	.actions .accept {
		margin-left: auto;
	}

	details.tech {
		margin: 0.5rem 0;
		font-size: 0.9rem;
		color: #4b5563;
	}

	details.tech summary {
		cursor: pointer;
		color: #6b7280;
	}

	.error {
		color: #b00020;
		font-weight: 500;
	}

	.ok {
		color: #0a7a2f;
		font-weight: 500;
	}
</style>

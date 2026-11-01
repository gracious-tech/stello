
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setup_globals} from '@/../tests/unit_utils'
import {Task, TaskAborted, TaskManager} from './tasks'
import {sleep} from '../utils/async'
import {MustReauthenticate, MustReconfigure, MustReconnect, MustWait, MustRestore, MustMakeSpace,
    MustSyncClock} from '../utils/exceptions'


// Task registry captures fn references at import, so replace contacts_remove with controllable fn
const fake_task = vi.hoisted(() => ({impl: async (task:unknown):Promise<unknown> => undefined}))
vi.mock('./contacts', async original => {
    const actual = await original<typeof import('./contacts')>()
    // WARN Must be a named function as task registry uses fn.name
    async function contacts_remove(task:Task){
        return fake_task.impl(task)
    }
    return {...actual, contacts_remove}
})


beforeEach(async () => {
    await setup_globals()
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.restoreAllMocks()
})


describe('Task', () => {

    test('id, display, status and percent', () => {
        const task = new Task('name', ['a', 'b'], [])
        expect(task.id).toBe('name a b')
        expect(task.display).toBe('name')
        task.label = 'Label'
        task.show_count = true
        task.subtasks_total = 4
        task.subtasks_done = 1
        expect(task.status).toBe('Label (1 of 4)')
        expect(task.percent).toBe(25)
        task.subtasks_done = 6  // More done than total
        expect(task.safe_total).toBe(6)
        task.abort()
        expect(task.status).toBe('Label')
    })

    test('percent is 0 when there are no subtasks', () => {
        // Avoid NaN (0/0) which would render as "NaN%" in progress UI
        expect(new Task('name', [], []).percent).toBe(0)
    })

    test('error_type maps errors', () => {
        const task = new Task('n', [], [])
        const cases:[unknown, string|null][] = [
            [null, null],
            [new MustReconnect(), 'network'],
            [new MustReauthenticate(), 'auth'],
            [new MustReconfigure(), 'settings'],
            [new MustWait(), 'throttled'],
            [new MustRestore(), 'restore'],
            [new MustMakeSpace(), 'storage'],
            ['MustAllow', 'permission'],
            [new MustSyncClock(), 'clock'],
            [new Error(), 'unknown'],
        ]
        for (const [error, type] of cases){
            task.error = error
            expect(task.error_type).toBe(type)
        }
    })

    test('add/expected track progress and reject with first error after all settle', async () => {
        const task = new Task('n', [], [])
        const single = await task.add(Promise.resolve(1))
        expect(single).toBe(1)
        let resolve_late!:()=>void
        const late = new Promise<void>(resolve => {resolve_late = resolve})
        const multi = task.add(Promise.reject(new Error('x')), late)
        let settled = false
        void multi.catch(() => {settled = true})
        await Promise.resolve()
        await Promise.resolve()
        expect(settled).toBe(false)  // Still waiting on `late`
        resolve_late()
        await expect(multi).rejects.toThrow('x')
        expect(task.subtasks_total).toBe(3)
        expect(task.subtasks_done).toBe(3)
        task.upcoming(2)
        expect(task.subtasks_total).toBe(5)
    })

    test('abort and check_aborted', () => {
        const task = new Task('n', [], [])
        expect(() => task.check_aborted()).not.toThrow()
        const error = task.abort('why')
        expect(error).toBeInstanceOf(TaskAborted)
        expect(() => task.check_aborted()).toThrow('why')
    })

    test('finish reports unknown errors only', async () => {
        const task = new Task('n', [], [])
        task.finish(new Error('bad'))
        expect(task.error_report_id).toBe('report_id')
        expect(await task.done).toBeInstanceOf(Error)
        const task2 = new Task('n', [], [])
        task2.finish(new MustReconnect())
        expect(task2.error_report_id).toBe(null)
        const task3 = new Task('n', [], [])
        task3.abort()
        task3.finish(new Error())
        expect(task3.error_report_id).toBe(null)
    })

    test('evolve changes name and params', async () => {
        const task = new Task('old', ['a'], ['b'])
        const fn = vi.fn(async () => undefined)
        Object.defineProperty(fn, 'name', {value: 'new_fn'})
        await task.evolve(fn, ['x'])
        expect(task.name).toBe('new_fn')
        expect(task.params).toEqual(['x'])
        expect(task.options).toEqual([])
        expect(fn).toHaveBeenCalledWith(task)
    })
})


describe('TaskManager', () => {

    // Use contacts_remove as a convenient task to control
    function spy_task(impl:(task:Task)=>Promise<unknown>){
        fake_task.impl = impl as typeof fake_task.impl
    }

    test('successful task moves to finished and succeeded', async () => {
        const manager = new TaskManager()
        spy_task(async () => undefined)
        const task = await manager.start_contacts_remove('c')
        expect(manager.data.tasks).toContain(task)
        expect(await task.done).toBe(null)
        expect(manager.data.tasks).toHaveLength(0)
        expect(manager.data.finished).toBe(task)
        expect(manager.data.succeeded).toBe(task)
    })

    test('returned subtasks are awaited and tracked', async () => {
        const manager = new TaskManager()
        spy_task(async () => [Promise.resolve(), Promise.resolve()])
        const task = await manager.start('contacts_remove', ['c'])
        await task.done
        expect(task.subtasks_total).toBe(2)
        expect(task.subtasks_done).toBe(2)
    })

    test('failed task moves to fails and restart clears previous fail', async () => {
        const manager = new TaskManager()
        spy_task(async () => {throw new MustReauthenticate()})
        const task = await manager.start('contacts_remove', ['c'])
        expect(await task.done).toBeInstanceOf(MustReauthenticate)
        expect(manager.data.fails).toEqual([task])
        const task2 = await manager.start('contacts_remove', ['c'])
        expect(manager.data.fails).toEqual([])
        await task2.done
        manager.abort_failed(task2, 'given up')
        expect(manager.data.fails).toEqual([])
        expect(manager.data.finished).toBe(task2)
        expect(task2.aborted?.message).toBe('given up')
    })

    test('TaskAborted thrown in task counts as aborted not failed', async () => {
        const manager = new TaskManager()
        spy_task(async () => {throw new TaskAborted('nope')})
        const task = await manager.start('contacts_remove', ['c'])
        await task.done
        expect(task.aborted?.message).toBe('nope')
        expect(manager.data.fails).toHaveLength(0)
        expect(manager.data.succeeded).toBe(null)
    })

    test('auto tasks are aborted on network failure', async () => {
        const manager = new TaskManager()
        spy_task(async () => {throw new MustReconnect()})
        const task = await manager.start('contacts_remove', ['c'], [], true)
        await task.done
        expect(task.aborted).not.toBe(null)
        expect(manager.data.fails).toHaveLength(0)
    })

    test('starting identical task returns existing one', async () => {
        const manager = new TaskManager()
        let resolve!:()=>void
        spy_task(() => new Promise<void>(r => {resolve = r}))
        const task1 = await manager.start('contacts_remove', ['c'], ['x'])
        const task2 = await manager.start('contacts_remove', ['c'], ['x'])
        expect(task2).toBe(task1)
        resolve()
        await task1.done
    })

    test('different options abort existing and wait for it before starting', async () => {
        const manager = new TaskManager()
        let first_running = false
        let overlap = false
        spy_task(async task => {
            if (first_running){
                overlap = true
            }
            first_running = true
            await new Promise(r => setTimeout(r, 10))
            first_running = false
            task.check_aborted()
        })
        const task1 = await manager.start('contacts_remove', ['c'], ['x'])
        const task2 = await manager.start('contacts_remove', ['c'], ['y'])
        expect(task1.aborted).not.toBe(null)
        await Promise.all([task1.done, task2.done])
        expect(overlap).toBe(false)
    })

    test('restarting while a restart is waiting only runs the latest', async () => {
        // A restart waiting for the first task must itself be aborted by a further restart
        const manager = new TaskManager()
        const ran:unknown[] = []
        spy_task(async task => {
            ran.push(task.options[0])
            await sleep(10)
            task.check_aborted()
        })
        const task1 = await manager.start('contacts_remove', ['c'], ['x'])
        const task2 = await manager.start('contacts_remove', ['c'], ['y'])
        const task3 = await manager.start('contacts_remove', ['c'], ['z'])
        await Promise.all([task1.done, task2.done, task3.done])
        expect(ran).toEqual(['x', 'z'])
        expect(task2.aborted).not.toBe(null)
        expect(task3.aborted).toBe(null)
    })

    test('restart returns the new task without waiting for the old one', async () => {
        // Starting must not block callers until the old task notices it was aborted
        const manager = new TaskManager()
        // Only the first task blocks (until released)
        let release!:()=>void
        const gate = new Promise<void>(resolve => {
            release = resolve
        })
        let calls = 0
        spy_task(async task => {
            calls += 1
            if (calls === 1){
                await gate
            }
            task.check_aborted()
        })
        await manager.start('contacts_remove', ['c'], ['x'])
        const task2 = await manager.start('contacts_remove', ['c'], ['y'])
        expect(manager.data.tasks).toContain(task2)
        expect(calls).toBe(1)  // New task waits for the old one before doing its work
        release()
        expect(await task2.done).toBe(null)
        expect(calls).toBe(2)
    })

    test('typed start helpers pass correct params', async () => {
        const manager = new TaskManager()
        const start = vi.spyOn(manager, 'start').mockResolvedValue(new Task('', [], []))
        await manager.start_contacts_sync('o', true)
        await manager.start_contacts_change_property('o', 'c', 'name', 'v')
        await manager.start_contacts_change_email('o', 'c', ['a'], 'a')
        await manager.start_contacts_create('o', 'addr', 'name')
        await manager.start_contacts_group_create('o', 'name', ['c'])
        await manager.start_contacts_group_remove('g')
        await manager.start_contacts_group_name('g', 'n')
        await manager.start_contacts_group_fill('g', ['c'])
        await manager.start_contacts_group_drain('g', ['c'])
        await manager.start_configs_update('p')
        await manager.start_hosts_storage_update('p')
        await manager.start_send_message('m')
        await manager.start_responses_receive(true)
        expect(start.mock.calls).toEqual([
            ['contacts_sync', ['o'], [], true],
            ['contacts_change_property', ['o', 'c', 'name'], ['v']],
            ['contacts_change_email', ['o', 'c'], [['a'], 'a']],
            ['contacts_create', ['o', 'addr'], ['name']],
            ['contacts_group_create', ['o', 'name'], [['c']]],
            ['contacts_group_remove', ['g']],
            ['contacts_group_name', ['g'], ['n']],
            ['contacts_group_fill', ['g'], [['c']]],
            ['contacts_group_drain', ['g'], [['c']]],
            ['configs_update', ['p']],
            ['hosts_storage_update', ['p']],
            ['send_message', ['m']],
            ['responses_receive', [], [], true],
        ])
    })
})

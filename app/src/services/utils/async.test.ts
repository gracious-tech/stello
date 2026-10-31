
import {afterEach, describe, expect, test, vi} from 'vitest'

import {sleep, setIntervalPlus, concurrent} from './async'


describe('sleep', () => {

    test('resolves after given ms', async () => {
        vi.useFakeTimers()
        let done = false
        const promise = sleep(1000).then(() => {done = true})
        await vi.advanceTimersByTimeAsync(999)
        expect(done).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await promise
        expect(done).toBe(true)
        vi.useRealTimers()
    })
})


describe('setIntervalPlus', () => {

    afterEach(() => {
        vi.useRealTimers()
    })

    test('converts units to ms', () => {
        vi.useFakeTimers()
        const spy = vi.spyOn(self, 'setInterval')
        const handler = () => undefined
        setIntervalPlus(2, 'h', false, handler)
        setIntervalPlus(3, 'm', false, handler)
        setIntervalPlus(4, 's', false, handler)
        setIntervalPlus(5, 'ms', false, handler)
        expect(spy.mock.calls.map(c => c[1])).toEqual([2*60*60*1000, 3*60*1000, 4000, 5])
        spy.mockRestore()
    })

    test('instant option calls handler asynchronously straight away', async () => {
        vi.useFakeTimers()
        const handler = vi.fn()
        const id = setIntervalPlus(1, 's', true, handler)
        expect(handler).not.toHaveBeenCalled()  // Async
        await vi.advanceTimersByTimeAsync(0)
        expect(handler).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1000)
        expect(handler).toHaveBeenCalledTimes(2)
        clearInterval(id)
    })
})


describe('concurrent', () => {

    test('runs all tasks with limited concurrency', async () => {
        let active = 0
        let max_active = 0
        const done:number[] = []
        const tasks = [...Array(10).keys()].map(i => async () => {
            active++
            max_active = Math.max(max_active, active)
            await sleep(1)
            active--
            done.push(i)
        })
        await concurrent(tasks, 3)
        expect(done.length).toBe(10)
        expect(max_active).toBe(3)
    })

    test('rejects with failure only after in-progress tasks stop', async () => {
        const finished:number[] = []
        const tasks = [
            async () => {throw new Error('fail')},
            async () => {await sleep(5); finished.push(1)},
        ]
        await expect(concurrent(tasks, 2)).rejects.toThrow('fail')
        expect(finished).toEqual([1])
    })

    test('stops starting new tasks after a failure', async () => {
        const started:number[] = []
        const tasks = [0, 1, 2, 3].map(i => async () => {
            started.push(i)
            if (i === 0){
                throw new Error('fail')
            }
            await sleep(1)
        })
        await expect(concurrent(tasks, 1)).rejects.toThrow('fail')
        expect(started).toEqual([0])
    })

    test('resolves for no tasks', async () => {
        await expect(concurrent([])).resolves.toBeUndefined()
    })
})


// Tests for host classes (AWS SDK calls are mocked at the command level)

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {mockClient} from 'aws-sdk-client-mock'
import {S3Client, HeadBucketCommand, PutObjectCommand, ListObjectsV2Command,
    DeleteObjectsCommand, DeleteObjectCommand, GetObjectCommand, CreateBucketCommand,
    PutBucketTaggingCommand, ListBucketsCommand, DeleteBucketCommand} from '@aws-sdk/client-s3'
import {SNSClient, ListSubscriptionsByTopicCommand, UnsubscribeCommand, SubscribeCommand,
    CreateTopicCommand} from '@aws-sdk/client-sns'
import {IAMClient, CreateRoleCommand, GetRoleCommand, PutRolePolicyCommand, CreateUserCommand,
    GetUserCommand, CreatePolicyCommand, PutUserPolicyCommand, ListAccessKeysCommand,
    DeleteAccessKeyCommand, CreateAccessKeyCommand, ListUsersCommand, DeleteUserCommand}
    from '@aws-sdk/client-iam'
import {STSClient, GetCallerIdentityCommand} from '@aws-sdk/client-sts'
import {LambdaClient, GetFunctionCommand, CreateFunctionCommand, UpdateFunctionCodeCommand,
    UpdateFunctionConfigurationCommand, AddPermissionCommand} from '@aws-sdk/client-lambda'
import {ApiGatewayV2Client, CreateApiCommand} from '@aws-sdk/client-apigatewayv2'
import {ResourceGroupsTaggingAPIClient, GetResourcesCommand}
    from '@aws-sdk/client-resource-groups-tagging-api'
import {EC2Client, DescribeRegionsCommand} from '@aws-sdk/client-ec2'
import {SSMClient, GetParameterCommand} from '@aws-sdk/client-ssm'
import {CognitoIdentityProviderClient, InitiateAuthCommand, UpdateUserAttributesCommand}
    from '@aws-sdk/client-cognito-identity-provider'
import {CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand}
    from '@aws-sdk/client-cognito-identity'

import {setup_globals, json_response} from '@/../tests/unit_utils'
import {Task} from '../tasks/tasks'
import {HostUserAws} from './aws_user'
import {HostManagerAws} from './aws_manager'
import {HostUserGracious, username_available, create_account, new_login, new_credentials,
    AccountsCreateError} from './gracious_user'
import {no404, RequestHandler, add_clock_skew_middleware, StorageBaseAws} from './aws_common'
import {validate_subdomain, displayer_asset_type, displayer_asset_gzipped, HostPermissionError,
    HOST_STORAGE_VERSION} from './common'
import {get_host_manager, get_host_user} from './hosts'
import * as misc from '../misc'
import {MustReconnect, MustSyncClock} from '../utils/exceptions'
import {buffer_to_standard_url64, string_to_utf8} from '../utils/coding'


// Skip the long waits AWS setup requires
vi.mock('@/services/utils/async', async original => ({
    ...await original<typeof import('@/services/utils/async')>(),
    sleep: async () => undefined,
}))


// Mocks for every client used
const s3 = mockClient(S3Client)
const sns = mockClient(SNSClient)
const iam = mockClient(IAMClient)
const sts = mockClient(STSClient)
const lambda = mockClient(LambdaClient)
const gateway = mockClient(ApiGatewayV2Client)
const tagging = mockClient(ResourceGroupsTaggingAPIClient)
const ec2 = mockClient(EC2Client)
const ssm = mockClient(SSMClient)
const cognito_idp = mockClient(CognitoIdentityProviderClient)
const cognito_id = mockClient(CognitoIdentityClient)
const all_mocks = [s3, sns, iam, sts, lambda, gateway, tagging, ec2, ssm, cognito_idp, cognito_id]


// Errors in the shape AWS SDK throws them
function aws_error(name:string, status:number){
    return Object.assign(new Error(name), {name, $metadata: {httpStatusCode: status}})
}

const creds = {accessKeyId: 'AK', secretAccessKey: 'SK'}
const new_user = () => new HostUserAws({credentials: creds, api_id: 'api1'}, 'bkt', 'us-west-2',
    null)

beforeEach(async () => {
    await setup_globals()
    for (const mock of all_mocks){
        mock.reset()
    }
    sts.on(GetCallerIdentityCommand).resolves({Account: '123'})
})

afterEach(() => {
    vi.restoreAllMocks()
})


describe('common', () => {

    test('validate_subdomain', () => {
        expect(validate_subdomain('good-name1')).toBe(null)
        expect(validate_subdomain('')).toContain('between')
        expect(validate_subdomain('a'.repeat(64))).toContain('between')
        expect(validate_subdomain('-bad')).toContain('hyphen')
        expect(validate_subdomain('bad-')).toContain('hyphen')
        expect(validate_subdomain('bad_name')).toContain('only contain')
        expect(validate_subdomain('ab', 3)).toContain('3 to 63')
    })

    test('displayer asset types and compression', () => {
        const cases:[string, string, boolean][] = [
            ['index.html', 'text/html', true], ['a.json', 'application/json', true],
            ['a.SVG', 'image/svg+xml', true], ['a.css', 'text/css', true],
            ['a.js', 'text/javascript', true], ['a.png', 'image/png', false],
            ['a.jpg', 'image/jpeg', false], ['a.woff2', 'application/octet-stream', true],
        ]
        for (const [path, type, gzipped] of cases){
            expect(displayer_asset_type(path)).toBe(type)
            expect(displayer_asset_gzipped(path)).toBe(gzipped)
        }
    })

    test('factories', () => {
        expect(get_host_manager('aws')).toBe(HostManagerAws)
        expect(() => get_host_manager('gracious')).toThrow('impossible')
        expect(get_host_user('aws')).toBe(HostUserAws)
        expect(get_host_user('gracious')).toBe(HostUserGracious)
        expect(() => get_host_user('other' as 'aws')).toThrow('impossible')
    })

    test('StorageBaseAws ids', () => {
        const base = new StorageBaseAws('bkt', 'r')
        expect([base._bucket_id, base._bucket_arn, base._bucket_domain, base._bucket_resp_id,
            base._bucket_resp_arn, base._user_id, base._topic_id, base._lambda_id,
            base._lambda_role_id, base._lambda_boundary_id]).toEqual(['bkt', 'arn:aws:s3:::bkt',
            'bkt.s3-r.amazonaws.com', 'bkt-stello-resp', 'arn:aws:s3:::bkt-stello-resp',
            'stello-bkt', 'stello-bkt', 'stello-bkt', 'stello-bkt-lambda',
            'stello-bkt-lambda-boundary'])
    })

    test('no404 ignores only 404s', async () => {
        expect(await no404(Promise.reject(aws_error('NotFound', 404)))).toBeUndefined()
        await expect(no404(Promise.reject(aws_error('Denied', 403)))).rejects.toThrow('Denied')
        await expect(no404(Promise.reject(null))).rejects.toBe(null)
        expect(await no404(Promise.resolve(5))).toBe(5)
    })

    test('RequestHandler converts fetch failures to MustReconnect', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
        const handler = new RequestHandler()
        await expect(handler.handle({path: '/x', method: 'GET', headers: {}, protocol: 'https:',
            hostname: 'h', query: {}} as never, undefined)).rejects.toBeInstanceOf(MustReconnect)
    })

    test('clock skew middleware retries once then throws MustSyncClock', async () => {
        let middleware!:(next:(a:unknown)=>Promise<unknown>)=>(a:unknown)=>Promise<unknown>
        add_clock_skew_middleware({middlewareStack: {add: (fn:never) => {middleware = fn}}} as
            never)
        const skewed = Object.assign(new Error(), {name: 'RequestTimeTooSkewed'})
        let calls = 0
        const always_skewed = middleware(async () => {calls++; throw skewed})
        await expect(always_skewed({})).rejects.toBeInstanceOf(MustSyncClock)
        expect(calls).toBe(2)
        const once = middleware(async () => {calls++; if (calls === 3) throw skewed; return 'ok'})
        expect(await once({})).toBe('ok')
        const other = middleware(async () => {throw new Error('other')})
        await expect(other({})).rejects.toThrow('other')
        let retry_calls = 0
        const retry_other = middleware(async () => {
            retry_calls++
            throw retry_calls === 1 ? skewed : new Error('different')
        })
        await expect(retry_other({})).rejects.toThrow('different')
    })
})


describe('HostUserAwsBase operations', () => {

    test('upload_file sets tags and content type', async () => {
        s3.on(PutObjectCommand).resolves({})
        const user = new_user()
        await user.upload_file('copies/1', new ArrayBuffer(2), 9999, 3)
        await user.upload_file('a', new Blob(['x'], {type: 'image/png'}))
        const [first, second] = s3.commandCalls(PutObjectCommand).map(c => c.args[0].input)
        expect(first).toMatchObject({Bucket: 'bkt', Key: 'messages/_user/copies/1',
            ContentType: 'application/octet-stream',
            Tagging: 'stello-lifespan=730&stello-reads=0&stello-max-reads=3'})
        expect(second).toMatchObject({ContentType: 'image/png', Tagging: ''})
    })

    test('list files/responses sorted by date with prefix stripped', async () => {
        s3.on(ListObjectsV2Command).resolves({Contents: [
            {Key: 'responses/_user/reply/2', LastModified: new Date(2)},
            {Key: 'responses/_user/reply/1', LastModified: new Date(1)},
        ]})
        expect(await new_user().list_responses('reply/')).toEqual(['reply/1', 'reply/2'])
        s3.on(ListObjectsV2Command).resolves({})
        expect(await new_user().list_files()).toEqual([])
    })

    test('download, delete and config uploads target correct buckets', async () => {
        s3.on(GetObjectCommand).resolves({Body: new Blob(['data']).stream() as never})
        s3.on(DeleteObjectCommand).resolves({})
        s3.on(PutObjectCommand).resolves({})
        const user = new_user()
        expect(new TextDecoder().decode(await user.download_response('r1'))).toBe('data')
        await user.delete_response('r1')
        await user.delete_file('f1')
        await user.upload_displayer_config(new ArrayBuffer(1))
        await user.upload_subscribe_config('[]')
        await user.upload_responder_config(new ArrayBuffer(1))
        const deletes = s3.commandCalls(DeleteObjectCommand).map(c => c.args[0].input)
        expect(deletes).toEqual([{Bucket: 'bkt-stello-resp', Key: 'responses/_user/r1'},
            {Bucket: 'bkt', Key: 'messages/_user/f1'}])
        const puts = s3.commandCalls(PutObjectCommand).map(c =>
            `${c.args[0].input.Bucket!}/${c.args[0].input.Key!}`)
        expect(puts).toEqual(['bkt/config/_user/config', 'bkt/config/_user/subscribe',
            'bkt-stello-resp/config/_user/config'])
    })
})


describe('HostUserAws', () => {

    test('update_email replaces confirmed subscription', async () => {
        sns.on(ListSubscriptionsByTopicCommand).resolves({Subscriptions: [
            {Endpoint: 'pending@x', SubscriptionArn: 'PendingConfirmation'},
            {Endpoint: 'old@x', SubscriptionArn: 'arn:sub'},
        ]})
        await new_user().update_email('new@x')
        expect(sns.commandCalls(UnsubscribeCommand)[0]!.args[0].input.SubscriptionArn)
            .toBe('arn:sub')
        expect(sns.commandCalls(SubscribeCommand)[0]!.args[0].input).toMatchObject({
            TopicArn: 'arn:aws:sns:us-west-2:123:stello-bkt', Endpoint: 'new@x'})
    })

    test('update_email does nothing if already subscribed', async () => {
        sns.on(ListSubscriptionsByTopicCommand).resolves({Subscriptions: [
            {Endpoint: 'same@x', SubscriptionArn: 'arn:sub'}]})
        await new_user().update_email('same@x')
        expect(sns.commandCalls(SubscribeCommand)).toHaveLength(0)
    })

    test('update_services sets up everything (fresh install)', async () => {
        vi.spyOn(misc, 'untar').mockResolvedValue([
            {name: 'index.html', type: '0', buffer: new ArrayBuffer(1)},
            {name: 'displayer/app.js', type: '', buffer: new ArrayBuffer(1)},
            {name: 'displayer/', type: '5', buffer: new ArrayBuffer(0)},
        ])
        s3.on(HeadBucketCommand).resolves({})
        s3.on(HeadBucketCommand, {Bucket: 'bkt-stello-resp'}).rejectsOnce(
            aws_error('NotFound', 404)).resolves({})
        s3.on(ListObjectsV2Command).resolves({Contents: [{Key: 'displayer/app.js'},
            {Key: 'displayer/old.js'}]})
        s3.on(DeleteObjectsCommand).resolves({})
        iam.on(GetRoleCommand).resolves({Role: {} as never})
        lambda.on(GetFunctionCommand).rejectsOnce(aws_error('NotFound', 404))
            .resolves({Configuration: {State: 'Active'}})
        sns.on(CreateTopicCommand).rejects(aws_error('EntityAlreadyExistsException', 409))
        lambda.on(AddPermissionCommand).rejects(aws_error('Conflict', 409))
        const task = new Task('', [], [])
        await new_user().update_services(task)

        expect(s3.commandCalls(CreateBucketCommand)[0]!.args[0].input.Bucket)
            .toBe('bkt-stello-resp')
        expect(iam.commandCalls(CreateRoleCommand)[0]!.args[0].input.PermissionsBoundary)
            .toBe('arn:aws:iam::123:policy/stello-bkt-lambda-boundary')
        expect(iam.commandCalls(PutRolePolicyCommand)).toHaveLength(1)
        expect(lambda.commandCalls(CreateFunctionCommand)[0]!.args[0].input).toMatchObject({
            FunctionName: 'stello-bkt', Handler: 'responder.entry'})
        const puts = s3.commandCalls(PutObjectCommand).map(c => c.args[0].input)
        expect(puts.map(p => p.Key)).toEqual(['displayer/app.js', '_'])
        expect(puts[0]).toMatchObject({ContentType: 'text/javascript', ContentEncoding: 'gzip'})
        expect(s3.commandCalls(DeleteObjectsCommand)[0]!.args[0].input.Delete!.Objects)
            .toEqual([{Key: 'displayer/old.js'}])
        const version_tag = s3.commandCalls(PutBucketTaggingCommand).at(-1)!.args[0].input
        expect(version_tag.Tagging!.TagSet).toContainEqual({Key: 'stello-version',
            Value: `${HOST_STORAGE_VERSION}`})
        // All declared subtasks should be tracked so progress reaches 100%
        expect(task.subtasks_done).toBe(task.subtasks_total)
    })

    test('update_services updates existing lambda only when changed', async () => {
        vi.spyOn(misc, 'untar').mockResolvedValue([])
        s3.on(HeadBucketCommand).resolves({})
        s3.on(ListObjectsV2Command).resolves({})
        iam.on(CreateRoleCommand).rejects(aws_error('EntityAlreadyExistsException', 409))
        iam.on(GetRoleCommand).resolves({Role: {} as never})
        lambda.on(GetFunctionCommand).resolves({Configuration: {StateReasonCode: 'Creating',
            CodeSha256: 'old', Runtime: 'python3.9', State: 'Active'}})
        await new_user().update_services(new Task('', [], []))
        expect(lambda.commandCalls(UpdateFunctionConfigurationCommand)).toHaveLength(1)
        expect(lambda.commandCalls(UpdateFunctionCodeCommand)).toHaveLength(1)
    })

    test('update_services converts Forbidden to HostPermissionError', async () => {
        vi.spyOn(misc, 'untar').mockResolvedValue([])
        s3.on(HeadBucketCommand).resolves({})
        s3.on(ListObjectsV2Command).resolves({})
        iam.on(CreateRoleCommand).rejects(aws_error('Forbidden', 403))
        await expect(new_user().update_services(new Task('', [], [])))
            .rejects.toBeInstanceOf(HostPermissionError)
    })

    test('delete_services removes all resources then own key', async () => {
        s3.on(ListObjectsV2Command).resolvesOnce({Contents: [{Key: 'a'}]}).resolves({})
        s3.on(DeleteObjectsCommand).resolves({})
        s3.on(DeleteBucketCommand).rejects(aws_error('NotFound', 404))
        tagging.on(GetResourcesCommand).resolves({ResourceTagMappingList: [
            {ResourceARN: 'arn:aws:s3:::bkt'},
            {ResourceARN: 'arn:aws:apigateway:us-west-2::/apis/found_api'},
        ]})
        const user = new HostUserAws({credentials: creds}, 'bkt', 'us-west-2', null)
        const task = new Task('', [], [])
        await user.delete_services(task)
        expect(user.generated.api_id).toBe('found_api')
        // All declared subtasks should be tracked so progress reaches 100%
        expect(task.subtasks_done).toBe(task.subtasks_total)
        expect(iam.commandCalls(DeleteAccessKeyCommand)[0]!.args[0].input).toEqual({
            UserName: 'stello-bkt', AccessKeyId: 'AK'})
    })

    test('_delete_objects throws if some objects fail to delete', async () => {
        s3.on(ListObjectsV2Command).resolves({Contents: [{Key: 'a'}]})
        s3.on(DeleteObjectsCommand).resolves({Errors: [{Key: 'a'}]})
        await expect(new_user()._delete_objects('bkt')).rejects.toThrow('Could not delete')
    })
})


describe('HostManagerAws', () => {

    test('list_storages combines users and version tags', async () => {
        s3.on(ListBucketsCommand).resolves({})
        iam.on(ListUsersCommand).resolves({Users: [
            {UserName: 'stello-one', Path: '/stello/us-west-2/'} as never,
            {UserName: 'stello-two', Path: '/stello/eu-west-1/'} as never,
        ]})
        tagging.on(GetResourcesCommand).resolves({ResourceTagMappingList: [
            {Tags: [{Key: 'stello', Value: 'one'}, {Key: 'stello-version', Value: '7'}]},
            {Tags: [{Key: 'stello', Value: 'unknown'}, {Key: 'stello-version', Value: '1'}]},
        ]})
        const storages = await new HostManagerAws(creds).list_storages()
        expect(storages).toEqual([{bucket: 'one', region: 'us-west-2', version: 7},
            {bucket: 'two', region: 'eu-west-1', version: undefined}])
    })

    test('regions', async () => {
        s3.on(ListBucketsCommand).resolves({})
        ec2.on(DescribeRegionsCommand).resolves({Regions: [{RegionName: 'us-west-2'}]})
        ssm.on(GetParameterCommand).resolves({Parameter: {Value: 'US West (Oregon)'}})
        const manager = new HostManagerAws(creds)
        expect(await manager.list_regions()).toEqual(['us-west-2'])
        expect(await manager.get_region_name('us-west-2')).toBe('US West (Oregon)')
    })

    test('bucket_available', async () => {
        s3.on(ListBucketsCommand).resolves({})
        const manager = new HostManagerAws(creds)
        s3.on(HeadBucketCommand).resolves({})
        expect(await manager.bucket_available('b')).toBe(false)
        s3.on(HeadBucketCommand).rejects(aws_error('NotFound', 404))
        expect(await manager.bucket_available('b')).toBe(true)
        s3.on(HeadBucketCommand).rejects(aws_error('Moved', 301))
        expect(await manager.bucket_available('b')).toBe(false)
        s3.on(HeadBucketCommand).rejects(aws_error('Forbidden', 403))
        expect(await manager.bucket_available('b')).toBe(false)
        manager._s3_accessible = false
        await expect(manager.bucket_available('b')).rejects.toBeInstanceOf(HostPermissionError)
        s3.on(HeadBucketCommand).rejects(aws_error('Other', 500))
        await expect(manager.bucket_available('b')).rejects.toThrow('Other')
    })

    test('no list bucket permission marks s3 inaccessible', async () => {
        s3.on(ListBucketsCommand).rejects(aws_error('Forbidden', 403))
        const manager = new HostManagerAws(creds)
        await new Promise(r => setTimeout(r, 10))
        expect(manager._s3_accessible).toBe(false)
    })

    test('new_storage creates bucket, api, user, policies and key', async () => {
        s3.on(ListBucketsCommand).resolves({})
        s3.on(HeadBucketCommand).rejects(aws_error('NotFound', 404))
        tagging.on(GetResourcesCommand).resolves({})
        gateway.on(CreateApiCommand).resolves({ApiId: 'new_api'})
        iam.on(CreateUserCommand).rejects(aws_error('EntityAlreadyExistsException', 409))
        iam.on(GetUserCommand).resolves({User: {} as never})
        iam.on(CreatePolicyCommand).rejects(aws_error('EntityAlreadyExistsException', 409))
        iam.on(ListAccessKeysCommand).resolves({AccessKeyMetadata: [{AccessKeyId: 'old'}]})
        iam.on(CreateAccessKeyCommand).resolves({AccessKey: {AccessKeyId: 'new',
            SecretAccessKey: 'secret'} as never})
        const generated = await new HostManagerAws(creds).new_storage('bkt', 'eu-west-1')
        expect(generated).toEqual({credentials: {accessKeyId: 'new', secretAccessKey: 'secret'},
            api_id: 'new_api'})
        expect(s3.commandCalls(CreateBucketCommand)[0]!.args[0].input).toMatchObject({
            Bucket: 'bkt', CreateBucketConfiguration: {LocationConstraint: 'eu-west-1'}})
        expect(iam.commandCalls(DeleteAccessKeyCommand)[0]!.args[0].input.AccessKeyId)
            .toBe('old')
        const policy = JSON.parse(iam.commandCalls(PutUserPolicyCommand)[0]!.args[0].input
            .PolicyDocument!) as {Statement:{Resource:unknown}[]}
        // SECURITY Full access must never include IAM resources
        expect(JSON.stringify(policy.Statement[0]!.Resource)).not.toContain(':iam:')
    })

    test('new_storage rethrows unexpected errors', async () => {
        s3.on(ListBucketsCommand).resolves({})
        s3.on(HeadBucketCommand).rejects(aws_error('Forbidden', 403))
        await expect(new HostManagerAws(creds).new_storage('bkt', 'r')).rejects.toThrow(
            'Forbidden')
    })

    test('delete_storage removes services, policies, keys and user', async () => {
        s3.on(ListBucketsCommand).resolves({})
        s3.on(ListObjectsV2Command).resolves({})
        tagging.on(GetResourcesCommand).resolves({})
        iam.on(ListAccessKeysCommand).rejects(aws_error('NotFound', 404))
        await new HostManagerAws(creds).delete_storage(new Task('', [], []), 'bkt', 'r')
        expect(iam.commandCalls(DeleteUserCommand)[0]!.args[0].input.UserName).toBe('stello-bkt')
    })
})


describe('gracious', () => {

    // Create a fake JWT with given payload
    const jwt = (payload:object) =>
        `h.${buffer_to_standard_url64(string_to_utf8(JSON.stringify(payload)))}.s`

    beforeEach(() => {
        cognito_idp.on(InitiateAuthCommand).resolves({AuthenticationResult: {
            IdToken: jwt({exp: 1000}), AccessToken: 'access'}})
    })

    test('new_login extracts expiry', async () => {
        const login = await new_login('user', 'pass')
        expect(login.id_token_expires).toBe(1_000_000)
        expect(cognito_idp.commandCalls(InitiateAuthCommand)[0]!.args[0].input.AuthParameters)
            .toEqual({USERNAME: 'user', PASSWORD: 'pass'})
    })

    test('new_credentials', async () => {
        cognito_id.on(GetCredentialsForIdentityCommand).resolves({Credentials: {
            AccessKeyId: 'a', SecretKey: 's', SessionToken: 't'}})
        expect(await new_credentials('fid', 'token')).toEqual({accessKeyId: 'a',
            secretAccessKey: 's', sessionToken: 't'})
    })

    test('username_available and create_account', async () => {
        const fetch_mock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(json_response({valid: true, available: true}))
            .mockResolvedValueOnce(json_response({password: 'pw'}))
            .mockResolvedValueOnce(json_response({error: 'username_taken'}))
        expect(await username_available('u')).toEqual({valid: true, available: true})
        cognito_id.on(GetIdCommand).resolves({IdentityId: 'fid'})
        const account = await create_account('u', 'e@x', 'c')
        expect(account).toMatchObject({password: 'pw', federated_id: 'fid'})
        const body = JSON.parse(fetch_mock.mock.calls[1]![1]!.body as string) as
            Record<string, string>
        expect(body['hashed_email']).not.toContain('e@x')
        await expect(create_account('u', 'e@x', 'c')).rejects.toBeInstanceOf(AccountsCreateError)
    })

    test('user update_email and delete_services', async () => {
        cognito_idp.on(UpdateUserAttributesCommand).resolves({})
        s3.on(ListObjectsV2Command).resolves({})
        s3.on(DeleteObjectCommand).resolves({})
        const user = new HostUserGracious({credentials: creds, username: 'usr', password: 'p'} as
            never, 'hosted', 'r', 'usr')
        await user.update_email('e@x')
        expect(cognito_idp.commandCalls(UpdateUserAttributesCommand)[0]!.args[0].input
            .UserAttributes![0]!.Name).toBe('custom:hashed_email')
        await user.update_services(new Task('', [], []))
        await user.delete_services(new Task('', [], []))
        const prefixes = s3.commandCalls(ListObjectsV2Command).map(c => c.args[0].input.Prefix)
        expect(prefixes).toEqual(['messages/usr/', 'config/usr/', 'responses/usr/'])
        expect(s3.commandCalls(DeleteObjectCommand)[0]!.args[0].input).toEqual(
            {Bucket: 'hosted-stello-resp', Key: 'config/usr/config'})
    })
})

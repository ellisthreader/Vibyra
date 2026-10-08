<?php
namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\Tools\Providers\Schema;
use App\Services\AgentWork\Proposals\{Proposals, ProposalReview};
use Illuminate\Http\Request;

final class WorkProposalsController extends Controller
{
    use V2Requests;

    public function index(Request $r, Proposals $service)
    {
        $user = $this->v2User($r);
        $d = $r->validate(['agentId' => 'sometimes|uuid', 'runId' => 'sometimes|uuid']);
        return $this->json(['proposals' => $service->list($user->id, $d['agentId'] ?? null, $d['runId'] ?? null)]);
    }

    public function show(Request $r, string $id, Proposals $service)
    {
        return $this->json(['proposal' => $service->payload($service->find($this->v2User($r)->id, $id))]);
    }

    public function update(Request $r, string $id, Proposals $service, ProposalReview $review)
    {
        $user = $this->v2User($r);
        Schema::only($r->all(), ['revision', 'spec']);
        $d = $r->validate(['revision' => 'required|integer|min:1', 'spec' => 'required|array']);
        return $this->json(['proposal' => $service->payload($review->edit($user->id, $id, $d['revision'], $d['spec']))]);
    }

    public function accept(Request $r, string $id, Proposals $service, ProposalReview $review)
    {
        $user = $this->v2User($r);
        Schema::only($r->all(), ['revision', 'reviewHash']);
        $d = $r->validate(['revision' => 'required|integer|min:1', 'reviewHash' => 'required|string|size:64']);
        return $this->json(['proposal' => $service->payload($review->accept($user->id, $id, $d['revision'], $d['reviewHash']))]);
    }

    public function discard(Request $r, string $id, Proposals $service, ProposalReview $review)
    {
        $user = $this->v2User($r);
        Schema::only($r->all(), ['revision']);
        $d = $r->validate(['revision' => 'required|integer|min:1']);
        return $this->json(['proposal' => $service->payload($review->discard($user->id, $id, $d['revision']))]);
    }
}
